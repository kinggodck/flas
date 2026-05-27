import axios from 'axios';
import prisma from '../lib/prisma';

const PROJECT_SHEET_GID = '1283549642';

export interface ProjectSyncResult {
  source: 'sheets' | 'error';
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
  error?: string;
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

export async function syncProjectsFromSheet(sheetsId: string): Promise<ProjectSyncResult> {
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

  // Load all factories + active zones
  const factories = await prisma.factory.findMany({ include: { zones: { where: { isActive: true } } } });

  // Build lookup maps: factory name variants → factory
  const factoryMap = new Map<string, typeof factories[0]>();
  for (const f of factories) {
    factoryMap.set(f.name, f);
    factoryMap.set(f.name.replace(/\s*\(.*\)/, '').trim(), f);
    factoryMap.set(f.code + '공장', f);
    factoryMap.set(f.code, f);
  }

  const lines = csvText.split('\n');
  let projectsUpserted = 0;
  let assignmentsUpserted = 0;
  let skipped = 0;

  for (const rawLine of lines) {
    const cols = parseCSVRow(rawLine.replace(/\r$/, ''));

    // Column indices (0-based):
    // 0=프로젝트코드, 1=사업부구분, 2=발주처, 3=ITEM, 4=제품군,
    // 12=SHOP(공장), 15=변경납기일, 26=변경납기일-조립기간(startDate),
    // 27=면적/(가로x세로), 28=면적/작업동
    if (cols.length < 29) { skipped++; continue; }

    const projectCode = cols[0].trim();
    const division    = cols[1].trim();
    const client      = cols[2].trim();
    const item        = cols[3].trim();
    const productGroup = cols[4].trim();
    const shopName    = cols[12].trim();
    const endDateStr  = cols[15].trim();
    const startDateStr = cols[26].trim();
    const dimStr      = cols[27].trim();
    const zoneName    = cols[28].trim();

    // Must have project code, factory, zone, dimensions, and dates
    if (!projectCode || !shopName || !zoneName || !dimStr || !endDateStr || !startDateStr) {
      skipped++; continue;
    }

    // Skip header row
    if (projectCode === '프로젝트코드' || projectCode === 'PJT코드') { skipped++; continue; }

    const dims = parseDimensions(dimStr);
    if (!dims) { skipped++; continue; }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      skipped++; continue;
    }

    // Find factory
    const factory = factoryMap.get(shopName)
      ?? factoryMap.get(shopName.replace(/\s*\(.*\)/, '').trim());
    if (!factory) {
      console.warn(`Project sync: unknown factory "${shopName}" (${projectCode})`);
      skipped++; continue;
    }

    // Find zone (case- and whitespace-insensitive)
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const zone = factory.zones.find((z) => normalize(z.name) === normalize(zoneName));
    if (!zone) {
      console.warn(`Project sync: zone "${zoneName}" not found in ${factory.name} (${projectCode})`);
      skipped++; continue;
    }

    // Upsert project
    const description = [division, item, productGroup].filter(Boolean).join(' / ') || null;
    const project = await prisma.project.upsert({
      where: { projectNo: projectCode },
      update: { clientName: client || null, description },
      create: { projectNo: projectCode, clientName: client || null, description, status: 'confirmed' },
    });
    projectsUpserted++;

    // Upsert assignment (by projectId + zoneId)
    const existing = await prisma.areaAssignment.findFirst({
      where: { projectId: project.id, zoneId: zone.id },
    });

    if (existing) {
      await prisma.areaAssignment.update({
        where: { id: existing.id },
        data: { startDate, endDate, requiredAreaSqm: dims.areaSqm, widthM: dims.widthM, heightM: dims.heightM },
      });
    } else {
      await prisma.areaAssignment.create({
        data: {
          projectId: project.id, zoneId: zone.id,
          startDate, endDate, requiredAreaSqm: dims.areaSqm,
          widthM: dims.widthM, heightM: dims.heightM, status: 'confirmed',
        },
      });
    }
    assignmentsUpserted++;
  }

  console.log(`Project sync done: ${projectsUpserted} projects, ${assignmentsUpserted} assignments, ${skipped} skipped`);
  return { source: 'sheets', projectsUpserted, assignmentsUpserted, skipped };
}
