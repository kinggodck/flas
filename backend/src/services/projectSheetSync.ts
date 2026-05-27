import axios from 'axios';
import prisma from '../lib/prisma';

const PROJECT_SHEET_GID = '1283549642';

export interface ProjectSyncResult {
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
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
  const m = raw.trim().match(/^([\d.]+)\s*[xX×]\s*([\d.]+)$/);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!w || !h) return null;
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

export async function upsertProjectRows(rows: ProjectRow[]): Promise<ProjectSyncResult> {
  const factories = await prisma.factory.findMany({ include: { zones: { where: { isActive: true } } } });

  const factoryMap = new Map<string, typeof factories[0]>();
  for (const f of factories) {
    factoryMap.set(f.name, f);
    factoryMap.set(f.name.replace(/\s*\(.*\)/, '').trim(), f);
    factoryMap.set(f.code + '공장', f);
    factoryMap.set(f.code, f);
  }

  let projectsUpserted = 0;
  let assignmentsUpserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const { projectCode, division, client, item, productGroup, shopName, endDate: endDateStr, startDate: startDateStr, dimensions: dimStr, zoneName } = row;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      skipped++; continue;
    }

    const factory = factoryMap.get(shopName) ?? factoryMap.get(shopName.replace(/\s*\(.*\)/, '').trim());
    if (!factory) {
      console.warn(`Project sync: unknown factory "${shopName}" (${projectCode})`);
      skipped++; continue;
    }

    const zone = findZone(factory.zones, zoneName);
    if (!zone) {
      console.warn(`Project sync: zone "${zoneName}" not found in ${factory.name} (${projectCode})`);
      skipped++; continue;
    }

    // Skip rows without valid dimensions
    const dims = dimStr ? parseDimensions(dimStr) : null;
    if (!dims) { skipped++; continue; }
    const { areaSqm: requiredAreaSqm, widthM, heightM } = dims;

    const description = [division, item, productGroup].filter(Boolean).join(' / ') || null;
    const project = await prisma.project.upsert({
      where: { projectNo: projectCode },
      update: { clientName: client || null, description },
      create: { projectNo: projectCode, clientName: client || null, description, status: 'confirmed' },
    });
    projectsUpserted++;

    const existing = await prisma.areaAssignment.findFirst({
      where: { projectId: project.id, zoneId: zone.id },
    });

    if (existing) {
      await prisma.areaAssignment.update({
        where: { id: existing.id },
        data: { startDate, endDate, requiredAreaSqm, widthM, heightM },
      });
    } else {
      await prisma.areaAssignment.create({
        data: { projectId: project.id, zoneId: zone.id, startDate, endDate, requiredAreaSqm, widthM, heightM, status: 'confirmed' },
      });
    }
    assignmentsUpserted++;
  }

  console.log(`Project sync done: ${projectsUpserted} projects, ${assignmentsUpserted} assignments, ${skipped} skipped`);
  return { projectsUpserted, assignmentsUpserted, skipped };
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
