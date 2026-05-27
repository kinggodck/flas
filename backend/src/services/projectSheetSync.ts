import axios from 'axios';
import prisma from '../lib/prisma';

const PROJECT_SHEET_GID = '1283549642';

export interface ProjectSyncResult {
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
  projectsDeleted?: number;
  assignmentsDeleted?: number;
  skippedByReason?: Record<string, number>;
  skippedSamples?: Array<{ reason: string; projectCode?: string; shopName?: string; zoneName?: string; dimensions?: string }>;
  error?: string;
}

export interface ProjectRow {
  projectCode: string;
  division?: string;
  client?: string;
  item?: string;
  productGroup?: string;
  shopName: string;
  endDate: string;
  startDate: string;
  dimensions?: string;
  zoneName: string;
}

interface UpsertProjectRowsOptions {
  replaceExisting?: boolean;
}

function parseCSVRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseDimensions(raw: string): { widthM: number; heightM: number; areaSqm: number } | null {
  const normalized = raw.trim().replace(/,/g, '').replace(/[X×＊*]/g, 'x');
  const m = normalized.match(/^([\d.]+)\s*x\s*([\d.]+)$/);
  if (!m) return null;
  let w = parseFloat(m[1]);
  let h = parseFloat(m[2]);
  if (!w || !h) return null;
  if (w > 500 || h > 500) {
    w /= 1000;
    h /= 1000;
  }
  return { widthM: w, heightM: h, areaSqm: w * h };
}

function findZone(zones: { id: number; name: string; availableAreaSqm: number }[], rawName: string) {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const candidates = [rawName, `shop ${rawName}`, `SHOP ${rawName}`];
  for (const cand of candidates) {
    const z = zones.find((z) => n(z.name) === n(cand));
    if (z) return z;
  }
  return null;
}

export async function upsertProjectRows(rows: ProjectRow[], options: UpsertProjectRowsOptions = {}): Promise<ProjectSyncResult> {
  const replaceExisting = options.replaceExisting ?? true;
  const factories = await prisma.factory.findMany({ include: { zones: { where: { isActive: true } } } });

  const factoryMap = new Map<string, typeof factories[0]>();
  for (const f of factories) {
    factoryMap.set(f.name, f);
    factoryMap.set(f.name.replace(/\s*\(.*\)/, '').trim(), f);
    factoryMap.set(f.code + '공장', f);
    factoryMap.set(f.code, f);
  }

  type ValidItem = {
    row: ProjectRow;
    zone: { id: number; name: string; availableAreaSqm: number };
    startDate: Date; endDate: Date;
    requiredAreaSqm: number; widthM: number; heightM: number;
    description: string | null;
  };

  const valid: ValidItem[] = [];
  let skipped = 0;
  const skippedByReason: Record<string, number> = {};
  const skippedSamples: NonNullable<ProjectSyncResult['skippedSamples']> = [];

  const skip = (
    reason: string,
    row: Partial<ProjectRow>,
  ) => {
    skipped++;
    skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    if (skippedSamples.length < 20) {
      skippedSamples.push({
        reason,
        projectCode: row.projectCode,
        shopName: row.shopName,
        zoneName: row.zoneName,
        dimensions: row.dimensions,
      });
    }
  };

  for (const row of rows) {
    const { projectCode, division, client, item, productGroup, shopName, endDate: endDateStr, startDate: startDateStr, dimensions: dimStr, zoneName } = row;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) { skip('invalid date range', row); continue; }

    const factory = factoryMap.get(shopName) ?? factoryMap.get(shopName.replace(/\s*\(.*\)/, '').trim());
    if (!factory) { console.warn(`unknown factory "${shopName}" (${projectCode})`); skip('unknown factory', row); continue; }

    const zone = findZone(factory.zones, zoneName);
    if (!zone) { console.warn(`zone "${zoneName}" not in ${factory.name} (${projectCode})`); skip('unknown zone', row); continue; }

    const dims = dimStr ? parseDimensions(dimStr) : null;
    if (!dims) { skip('invalid dimensions', row); continue; }

    valid.push({
      row, zone, startDate, endDate,
      requiredAreaSqm: dims.areaSqm, widthM: dims.widthM, heightM: dims.heightM,
      description: [division, item, productGroup].filter(Boolean).join(' / ') || null,
    });
  }

  if (valid.length === 0) {
    return { projectsUpserted: 0, assignmentsUpserted: 0, skipped, skippedByReason, skippedSamples };
  }

  const projectRows = new Map<string, { projectNo: string; clientName: string | null; descriptions: Set<string> }>();
  for (const item of valid) {
    const projectNo = item.row.projectCode;
    const project = projectRows.get(projectNo);
    if (project) {
      if (!project.clientName && item.row.client) project.clientName = item.row.client;
      if (item.description) project.descriptions.add(item.description);
    } else {
      projectRows.set(projectNo, {
        projectNo,
        clientName: item.row.client || null,
        descriptions: item.description ? new Set([item.description]) : new Set(),
      });
    }
  }
  const projects = [...projectRows.values()].map((project) => ({
    projectNo: project.projectNo,
    clientName: project.clientName,
    description: [...project.descriptions].join('\n') || null,
  }));

  const placeholders = projects.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, 'active', NOW(), NOW())`).join(', ');
  const values = projects.flatMap(p => [p.projectNo, p.clientName, p.description]);
  const incomingProjectNos = projects.map((p) => p.projectNo);

  const result = await prisma.$transaction(async (tx) => {
    // Query 1: bulk upsert unique projects, get IDs back
    const upserted = await tx.$queryRawUnsafe<{ id: number; projectNo: string }[]>(
    `INSERT INTO "Project" ("projectNo", "clientName", "description", "status", "createdAt", "updatedAt")
     VALUES ${placeholders}
     ON CONFLICT ("projectNo") DO UPDATE SET
       "clientName" = EXCLUDED."clientName",
       "description" = EXCLUDED."description",
       "status" = 'active',
       "updatedAt" = NOW()
     RETURNING id, "projectNo"`,
      ...values
    );
    const projectIdMap = new Map(upserted.map(p => [p.projectNo, p.id]));

    // Query 2: delete assignments for projects no longer present in the current sheet.
    const staleWhere = {
      projectNo: { notIn: incomingProjectNos },
      OR: [
        { status: 'confirmed' },
        { projectNo: { startsWith: 'U' } },
      ],
    };
    const staleProjects = replaceExisting
      ? await tx.project.findMany({ where: staleWhere, select: { id: true } })
      : [];
    const staleProjectIds = staleProjects.map((p) => p.id);
    const staleAssignments = staleProjectIds.length > 0
      ? await tx.areaAssignment.deleteMany({ where: { projectId: { in: staleProjectIds } } })
      : { count: 0 };
    const deletedProjects = staleProjectIds.length > 0
      ? await tx.project.deleteMany({ where: { id: { in: staleProjectIds } } })
      : { count: 0 };

    // Query 3: delete old assignments for incoming projects (clean re-sync).
    await tx.areaAssignment.deleteMany({ where: { projectId: { in: [...projectIdMap.values()] } } });

    // Query 4: bulk insert all current assignments.
    await tx.areaAssignment.createMany({
      data: valid.map(v => ({
        projectId: projectIdMap.get(v.row.projectCode)!,
        zoneId: v.zone.id,
        startDate: v.startDate,
        endDate: v.endDate,
        requiredAreaSqm: v.requiredAreaSqm,
        widthM: v.widthM,
        heightM: v.heightM,
        status: 'confirmed',
      })),
    });

    return {
      projectsDeleted: deletedProjects.count,
      assignmentsDeleted: staleAssignments.count,
    };
  });

  console.log(`sync: ${projects.length} projects, ${valid.length} assignments, ${skipped} skipped, ${result.projectsDeleted} stale projects deleted`);
  return {
    projectsUpserted: projects.length,
    assignmentsUpserted: valid.length,
    skipped,
    skippedByReason,
    skippedSamples,
    ...result,
  };
}

export async function syncProjectsFromSheet(sheetsId: string): Promise<ProjectSyncResult & { source: 'sheets' | 'error' }> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv&gid=${PROJECT_SHEET_GID}`;

  let csvText: string;
  try {
    const res = await axios.get<string>(url, {
      responseType: 'text',
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FLAS/1.0)' },
    });
    csvText = res.data;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`Project sheet sync failed: ${message}`);
    return { source: 'error', projectsUpserted: 0, assignmentsUpserted: 0, skipped: 0, error: message };
  }

  const rows: ProjectRow[] = [];
  let lineIndex = 0;
  for (const rawLine of csvText.split('\n')) {
    lineIndex++;
    if (lineIndex <= 2) continue; // skip 2 header rows

    const cols = parseCSVRow(rawLine.replace(/\r$/, ''));
    if (cols.length < 30) continue;

    // Corrected column indices (actual spreadsheet structure):
    // col 1=프로젝트코드, col 2=사업부구분, col 3=발주처, col 4=ITEM, col 5=제품군
    // col 13=SHOP, col 16=변경납기일, col 27=변경납기일-조립기간, col 28=면적(가로x세로), col 29=작업동
    const projectCode = cols[1].trim();
    if (!projectCode || projectCode === '프로젝트코드') continue;

    const shopName  = cols[13].trim();
    const endDateStr = cols[16].trim();
    const startDateStr = cols[27].trim();
    const dimStr    = cols[28].trim();
    const zoneName  = cols[29].trim();

    if (!shopName || !zoneName || !endDateStr || !startDateStr) continue;

    rows.push({
      projectCode,
      division:     cols[2].trim(),
      client:       cols[3].trim(),
      item:         cols[4].trim(),
      productGroup: cols[5].trim(),
      shopName, endDate: endDateStr, startDate: startDateStr,
      dimensions: dimStr || undefined, zoneName,
    });
  }

  const result = await upsertProjectRows(rows);
  return { source: 'sheets', ...result };
}
