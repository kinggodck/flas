import axios from 'axios';
import prisma from '../lib/prisma';

interface ZoneData {
  name: string;
  availableAreaSqm: number;
  dimensions: string | null;
  usageType: string;
}

interface FactoryData {
  code: string;
  name: string;
  totalAreaSqm: number | null;
  zones: ZoneData[];
}

export interface SyncResult {
  source: 'sheets' | 'static';
  factories: number;
  zones: number;
}

// Built-in data (mirrors Google Sheets source of truth)
const STATIC_DATA: FactoryData[] = [
  {
    code: '이진', name: '이진공장', totalAreaSqm: 66619,
    zones: [
      { name: 'A-1', availableAreaSqm: 2610, dimensions: '25x160', usageType: '조립' },
      { name: 'A-2', availableAreaSqm: 2790, dimensions: '25x160', usageType: '조립' },
      { name: 'B-1', availableAreaSqm: 3792, dimensions: '25x160', usageType: '조립' },
      { name: 'B-2', availableAreaSqm: 3952, dimensions: '25x160', usageType: '조립' },
      { name: 'B-3', availableAreaSqm: 4784, dimensions: '25x160', usageType: '조립' },
      { name: 'B-4', availableAreaSqm: 5072, dimensions: '25x160', usageType: '조립' },
      { name: '도장샵', availableAreaSqm: 1070, dimensions: null, usageType: '도장' },
      { name: 'RT ROOM-1', availableAreaSqm: 300, dimensions: null, usageType: '검사' },
      { name: 'RT ROOM-2', availableAreaSqm: 149, dimensions: null, usageType: '검사' },
      { name: 'YARD-1', availableAreaSqm: 10339, dimensions: null, usageType: '야적' },
      { name: 'YARD-2', availableAreaSqm: 2350, dimensions: null, usageType: '야적' },
      { name: 'YARD-3', availableAreaSqm: 3600, dimensions: null, usageType: '야적' },
      { name: 'YARD-4', availableAreaSqm: 1214, dimensions: null, usageType: '야적' },
      { name: 'YARD-5', availableAreaSqm: 3200, dimensions: null, usageType: '야적' },
    ],
  },
  {
    code: '처용', name: '처용공장', totalAreaSqm: 22328,
    zones: [
      { name: 'shop A', availableAreaSqm: 2701, dimensions: '25x105', usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 2686, dimensions: '25x105', usageType: '조립' },
      { name: 'shop C', availableAreaSqm: 2581, dimensions: '25x105', usageType: '조립' },
      { name: 'shop D', availableAreaSqm: 2747, dimensions: '25x105', usageType: '조립' },
      { name: 'YARD-1', availableAreaSqm: 2100, dimensions: null, usageType: '야적' },
      { name: 'YARD-2', availableAreaSqm: 1725, dimensions: null, usageType: '야적' },
      { name: 'RT ROOM', availableAreaSqm: 237, dimensions: null, usageType: '검사' },
      { name: '자재창고1', availableAreaSqm: 323, dimensions: null, usageType: '창고' },
      { name: '자재창고2', availableAreaSqm: 562, dimensions: null, usageType: '창고' },
      { name: '위험물저장소', availableAreaSqm: 21, dimensions: null, usageType: '기타' },
      { name: '기계실', availableAreaSqm: 75, dimensions: null, usageType: '기타' },
    ],
  },
  {
    code: '경주', name: '경주공장', totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 1000, dimensions: '20x60', usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 900, dimensions: '20x50', usageType: '조립' },
      { name: 'shop C', availableAreaSqm: 585, dimensions: '18x50', usageType: '조립' },
      { name: 'shop D', availableAreaSqm: 810, dimensions: '18x50', usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 2927, dimensions: null, usageType: '야적' },
    ],
  },
  {
    code: '고성', name: '고성공장', totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 1817, dimensions: null, usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 1975, dimensions: null, usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 10145, dimensions: null, usageType: '야적' },
    ],
  },
  {
    code: '거제', name: '거제공장(임대)', totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 2250, dimensions: null, usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 16880, dimensions: null, usageType: '야적' },
    ],
  },
  {
    code: '기계', name: '기계공장', totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 2304, dimensions: null, usageType: '조립' },
    ],
  },
];

// Parse a single CSV row, handling quoted fields
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

function guessUsageType(name: string): string {
  if (/YARD/i.test(name)) return '야적';
  if (/RT ROOM|검사/i.test(name)) return '검사';
  if (/도장/i.test(name)) return '도장';
  if (/창고/i.test(name)) return '창고';
  if (/기계실|저장소|위험물/i.test(name)) return '기타';
  return '조립';
}

function parseGoogleSheetsCsv(csv: string): FactoryData[] {
  const factories: FactoryData[] = [];
  let currentFactory: FactoryData | null = null;

  // Find lines that have actual data (skip header rows)
  const lines = csv.split('\n');
  const SKIP_ZONES = new Set(['본관동', '지원동', '기타', '소 계', '소계']);

  for (const rawLine of lines) {
    const cols = parseCSVRow(rawLine.replace(/\r$/, ''));
    if (cols.length < 5) continue;

    const [순번Col, factoryCol, zoneCol, dimsCol, areaCol] = cols;
    const 순번 = 순번Col.trim();
    const factoryCell = factoryCol.trim();
    const zoneName = zoneCol.trim();
    const dimsCell = dimsCol.trim();
    const areaCell = areaCol.replace(/,/g, '').trim();

    // New factory: 순번 column has a digit
    if (/^\d+$/.test(순번) && factoryCell) {
      // Extract factory name: everything before the first number or ㎡
      const name = factoryCell.replace(/\s+[\d,]+㎡.*$/, '').trim();
      const code = name.match(/^(.+?)공장/)?.[1] ?? name.slice(0, 2);

      const totalMatch = factoryCell.match(/([\d,]+)㎡/);
      const totalAreaSqm = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null;

      currentFactory = { code, name, totalAreaSqm, zones: [] };
      factories.push(currentFactory);
    }

    if (!currentFactory || !zoneName || SKIP_ZONES.has(zoneName)) continue;

    const area = Number(areaCell);
    if (!area || area <= 0) continue;

    const dims = dimsCell
      ? dimsCell.replace(/\s+x\s+/i, 'x').replace(/\s+X\s+/i, 'x')
      : null;

    currentFactory.zones.push({
      name: zoneName,
      availableAreaSqm: area,
      dimensions: dims,
      usageType: guessUsageType(zoneName),
    });
  }

  return factories;
}

async function upsertFactories(data: FactoryData[]): Promise<number> {
  let totalZones = 0;
  for (const f of data) {
    const factory = await prisma.factory.upsert({
      where: { code: f.code },
      update: { name: f.name, totalAreaSqm: f.totalAreaSqm },
      create: { code: f.code, name: f.name, totalAreaSqm: f.totalAreaSqm },
    });
    for (const z of f.zones) {
      await prisma.zone.upsert({
        where: { factoryId_name: { factoryId: factory.id, name: z.name } },
        update: { availableAreaSqm: z.availableAreaSqm, usageType: z.usageType, dimensions: z.dimensions },
        create: {
          factoryId: factory.id,
          name: z.name,
          availableAreaSqm: z.availableAreaSqm,
          usageType: z.usageType,
          dimensions: z.dimensions,
        },
      });
      totalZones++;
    }
    console.log(`  ✓ ${f.name} (${f.zones.length}개 구역)`);
  }
  return totalZones;
}

export async function syncFactories(sheetsId?: string): Promise<SyncResult> {
  if (sheetsId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv&gid=0`;
    try {
      const res = await axios.get<string>(url, {
        responseType: 'text',
        timeout: 15000,
        // User-agent to avoid bot detection
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FLAS/1.0)' },
      });
      const data = parseGoogleSheetsCsv(res.data);
      if (data.length === 0) throw new Error('No factories parsed from sheet');
      const zones = await upsertFactories(data);
      return { source: 'sheets', factories: data.length, zones };
    } catch (err) {
      console.warn(`Google Sheets sync failed (${(err as Error).message}), using built-in data`);
    }
  }

  const zones = await upsertFactories(STATIC_DATA);
  return { source: 'static', factories: STATIC_DATA.length, zones };
}

// Called on startup: always sync if GOOGLE_SHEETS_ID is set; otherwise seed only when DB is empty
export async function autoSync(): Promise<void> {
  const sheetsId = process.env.GOOGLE_SHEETS_ID;
  const existingCount = await prisma.factory.count();

  if (sheetsId) {
    console.log('Syncing factory master data from Google Sheets...');
    const r = await syncFactories(sheetsId);
    console.log(`  → source=${r.source}, ${r.factories} factories, ${r.zones} zones`);
  } else if (existingCount === 0) {
    console.log('Empty DB — seeding built-in factory master data...');
    const r = await syncFactories();
    console.log(`  → ${r.factories} factories, ${r.zones} zones`);
  } else {
    console.log(`Factory data ready (${existingCount} factories in DB).`);
  }
}
