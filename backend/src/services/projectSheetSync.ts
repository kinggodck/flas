import axios from 'axios';
import prisma from '../lib/prisma';

const PROJECT_SHEET_GID = process.env.GOOGLE_PROJECT_SHEET_GID ?? '1283549642';

export interface ProjectSyncResult {
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
  projectsDeleted?: number;
  assignmentsDeleted?: number;
  skippedByReason?: Record<string, number>;
  skippedSamples?: Array<{
    reason: string;
    projectCode?: string;
    shopName?: string;
    zoneName?: string;
    dimensions?: string;
  }>;
  error?: string;
}

export interface ProjectRow {
  projectCode: string;
  division?: string;       // 사업부문 (BU)
  client?: string;
  item?: string;
  productGroup?: string;
  shopName: string;
  endDate: string;
  startDate: string;
  // Phase 1 (or single-phase)
  widthM?: string;
  heightM?: string;
  quantity?: string;
  marginRate?: string;     // % value string e.g. "10"
  zoneName: string;
  // Phase 2 (optional)
  phase2Start?: string;
  phase2End?: string;
  phase2Width?: string;
  phase2Height?: string;
  phase2Quantity?: string;
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

function getSheetFetchErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) return (err as Error).message;
  const status = err.response?.status;
  if (status === 401 || status === 403) {
    return 'Google Sheets 접근 권한이 없습니다. 시트를 "링크가 있는 모든 사용자 보기 가능"으로 공유하거나, Apps Script에서 FLAS로 전송하세요.';
  }
  if (status === 400 || status === 404) {
    return `Google Sheets 탭을 찾을 수 없습니다. GOOGLE_PROJECT_SHEET_GID=${PROJECT_SHEET_GID} 값과 삭제된 탭 여부를 확인하세요.`;
  }
  return err.message;
}

// "20.5 x 18" 또는 "20.5x18" → { widthM, heightM }
function parseDimPair(raw: string): { w: number; h: number } | null {
  const n = raw.trim().replace(/,/g, '').replace(/[X×＊*]/gi, 'x');
  const m = n.match(/^([\d.]+)\s*x\s*([\d.]+)$/);
  if (!m) return null;
  let w = parseFloat(m[1]);
  let h = parseFloat(m[2]);
  if (!w || !h) return null;
  // mm → m 자동 변환
  if (w > 500 || h > 500) { w /= 1000; h /= 1000; }
  return { w, h };
}

// 면적 계산: widthM × heightM × quantity × (1 + marginRate/100)
function calcArea(w: number, h: number, qty: number, margin: number): number {
  return w * h * qty * (1 + margin / 100);
}

function findZone(
  zones: { id: number; name: string; availableAreaSqm: number }[],
  rawName: string,
) {
  const n   = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const nd  = (s: string) => s.toLowerCase().replace(/[\s\-]/g, ''); // 대시·공백 제거

  // 1. 기본 후보 (정확 + "shop " 접두 추가)
  for (const cand of [rawName, `shop ${rawName}`, `SHOP ${rawName}`]) {
    const z = zones.find(z => n(z.name) === n(cand));
    if (z) return z;
  }

  // 2. 대시 제거 비교: A1 → A-1, B3 → B-3 (이진공장 패턴)
  for (const zone of zones) {
    if (nd(zone.name) === nd(rawName)) return zone;
    if (nd(zone.name) === nd(`shop${rawName}`)) return zone;
  }

  // 3. Y + 숫자 → YARD-N (이진공장: Y1 → YARD-1)
  const yardM = rawName.match(/^Y(\d+)$/i);
  if (yardM) {
    const z = zones.find(z => n(z.name) === n(`YARD-${yardM[1]}`));
    if (z) return z;
  }

  // 4. S + 숫자 → shop A/B/C... (거제공장: S1→A, S2→B, S3→C)
  const shopM = rawName.match(/^S(\d+)$/i);
  if (shopM) {
    const letter = String.fromCharCode(64 + parseInt(shopM[1])); // 1→A, 2→B, 3→C
    const z = zones.find(z => n(z.name) === n(`shop${letter}`));
    if (z) return z;
    // YARD fallback: S번호가 shop 개수 초과면 YARD로
    const yardZ = zones.find(z => /yard/i.test(z.name));
    if (yardZ) return yardZ;
  }

  return null;
}

export async function upsertProjectRows(
  rows: ProjectRow[],
  options: UpsertProjectRowsOptions = {},
): Promise<ProjectSyncResult> {
  const replaceExisting = options.replaceExisting ?? true;
  const factories = await prisma.factory.findMany({
    include: { zones: { where: { isActive: true } } },
  });

  const factoryMap = new Map<string, typeof factories[0]>();
  for (const f of factories) {
    factoryMap.set(f.name, f);
    factoryMap.set(f.name.replace(/\s*\(.*\)/, '').trim(), f);
    factoryMap.set(f.code + '공장', f);
    factoryMap.set(f.code, f);
  }

  interface ValidItem {
    row: ProjectRow;
    zone: { id: number; name: string; availableAreaSqm: number };
    startDate: Date;
    endDate: Date;
    requiredAreaSqm: number;
    widthM: number;
    heightM: number;
    quantity: number;
    marginRate: number;
    description: string | null;
    businessDivision: string | null;
    // 2구간
    phase2?: { startDate: Date; endDate: Date; widthM: number; heightM: number; quantity: number; marginRate: number; calculatedAreaSqm: number };
  }

  const valid: ValidItem[] = [];
  let skipped = 0;
  const skippedByReason: Record<string, number> = {};
  const skippedSamples: NonNullable<ProjectSyncResult['skippedSamples']> = [];

  const skip = (reason: string, row: Partial<ProjectRow>) => {
    skipped++;
    skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    if (skippedSamples.length < 20) {
      skippedSamples.push({ reason, projectCode: row.projectCode, shopName: row.shopName, zoneName: row.zoneName });
    }
  };

  for (const row of rows) {
    const { projectCode, division, item, productGroup, shopName, endDate: endDateStr, startDate: startDateStr, widthM: wStr, heightM: hStr, quantity: qStr, marginRate: mrStr, zoneName } = row;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) { skip('invalid date range', row); continue; }

    const factory = factoryMap.get(shopName) ?? factoryMap.get(shopName.replace(/\s*\(.*\)/, '').trim());
    if (!factory) { console.warn(`unknown factory "${shopName}" (${projectCode})`); skip('unknown factory', row); continue; }

    const zone = findZone(factory.zones, zoneName);
    if (!zone) { console.warn(`zone "${zoneName}" not in ${factory.name} (${projectCode})`); skip('unknown zone', row); continue; }

    // 면적 계산
    let widthM = 0, heightM = 0, quantity = 1, marginRate = 0;
    if (wStr && hStr) {
      widthM = parseFloat(wStr.replace(/,/g, '')) || 0;
      heightM = parseFloat(hStr.replace(/,/g, '')) || 0;
      if (widthM > 500 || heightM > 500) { widthM /= 1000; heightM /= 1000; }
    } else if (wStr) {
      // "widthxheight" 형태가 하나의 필드에 들어올 수도 있음
      const dims = parseDimPair(wStr);
      if (dims) { widthM = dims.w; heightM = dims.h; }
    }
    if (qStr) quantity = parseInt(qStr, 10) || 1;
    if (mrStr) marginRate = parseFloat(mrStr) || 0;

    if (!widthM || !heightM) { skip('invalid dimensions', row); continue; }

    const requiredAreaSqm = calcArea(widthM, heightM, quantity, marginRate);

    // 2구간
    let phase2: ValidItem['phase2'] | undefined;
    if (row.phase2Start && row.phase2End && row.phase2Width && row.phase2Height) {
      const p2Start = new Date(row.phase2Start);
      const p2End = new Date(row.phase2End);
      if (!isNaN(p2Start.getTime()) && !isNaN(p2End.getTime()) && p2Start < p2End) {
        const p2W = parseFloat(row.phase2Width.replace(/,/g, '')) || 0;
        const p2H = parseFloat(row.phase2Height.replace(/,/g, '')) || 0;
        const p2Q = parseInt(row.phase2Quantity ?? '1', 10) || 1;
        if (p2W && p2H) {
          phase2 = { startDate: p2Start, endDate: p2End, widthM: p2W, heightM: p2H, quantity: p2Q, marginRate, calculatedAreaSqm: calcArea(p2W, p2H, p2Q, marginRate) };
        }
      }
    }

    valid.push({
      row, zone, startDate, endDate, requiredAreaSqm, widthM, heightM, quantity, marginRate,
      description: [item, productGroup].filter(Boolean).join(' / ') || null,
      businessDivision: division || null,
      phase2,
    });
  }

  if (valid.length === 0) {
    return { projectsUpserted: 0, assignmentsUpserted: 0, skipped, skippedByReason, skippedSamples };
  }

  // 프로젝트 집계
  const projectRows = new Map<string, { projectNo: string; clientName: string | null; descriptions: Set<string>; businessDivision: string | null }>();
  for (const v of valid) {
    const projectNo = v.row.projectCode;
    const existing = projectRows.get(projectNo);
    if (existing) {
      if (!existing.clientName && v.row.client) existing.clientName = v.row.client;
      if (v.description) existing.descriptions.add(v.description);
      if (!existing.businessDivision && v.businessDivision) existing.businessDivision = v.businessDivision;
    } else {
      projectRows.set(projectNo, {
        projectNo,
        clientName: v.row.client || null,
        descriptions: v.description ? new Set([v.description]) : new Set(),
        businessDivision: v.businessDivision,
      });
    }
  }

  const incomingProjectNos = [...projectRows.keys()];

  // Neon serverless에서 긴 interactive transaction이 연결 종료로 실패하므로
  // 순차 처리 방식으로 교체 (atomicity 포기, sync 재실행으로 복구 가능)

  // 1. 프로젝트 upsert (개별 처리)
  const projectIdMap = new Map<string, number>();
  for (const p of projectRows.values()) {
    const proj = await prisma.project.upsert({
      where: { projectNo: p.projectNo },
      update: { clientName: p.clientName, description: [...p.descriptions].join('\n') || null, businessDivision: p.businessDivision, status: 'active', updatedAt: new Date() },
      create: { projectNo: p.projectNo, clientName: p.clientName, description: [...p.descriptions].join('\n') || null, businessDivision: p.businessDivision, status: 'active' },
    });
    projectIdMap.set(p.projectNo, proj.id);
  }

  // 2. 오래된 프로젝트 삭제
  let deletedProjects = 0, deletedAssignments = 0;
  if (replaceExisting) {
    const staleProjects = await prisma.project.findMany({
      where: { projectNo: { notIn: incomingProjectNos } },
      select: { id: true },
    });
    if (staleProjects.length > 0) {
      const staleIds = staleProjects.map(p => p.id);
      await prisma.areaDemandSegment.deleteMany({ where: { assignment: { projectId: { in: staleIds } } } });
      const del = await prisma.areaAssignment.deleteMany({ where: { projectId: { in: staleIds } } });
      const delP = await prisma.project.deleteMany({ where: { id: { in: staleIds } } });
      deletedAssignments = del.count;
      deletedProjects = delP.count;
    }
  }

  // 3. 기존 배치 삭제 후 재삽입
  const incomingIds = [...projectIdMap.values()];
  await prisma.areaDemandSegment.deleteMany({ where: { assignment: { projectId: { in: incomingIds } } } });
  await prisma.areaAssignment.deleteMany({ where: { projectId: { in: incomingIds } } });

  // 4. 배치 삽입 (50건 청크)
  const CHUNK = 50;
  let assignmentsUpserted = 0;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const created = await prisma.areaAssignment.createMany({
      data: chunk.map(v => ({
        projectId: projectIdMap.get(v.row.projectCode)!,
        zoneId: v.zone.id,
        startDate: v.startDate,
        endDate: v.endDate,
        requiredAreaSqm: v.requiredAreaSqm,
        widthM: v.widthM,
        heightM: v.heightM,
        quantity: v.quantity,
        marginRate: v.marginRate,
        status: 'confirmed',
      })),
    });
    assignmentsUpserted += created.count;
  }

  // 5. ProjectItem 동기화 — 시트의 ITEM/규격 컬럼 → 아이템별 면적 대시보드용
  // 동일 프로젝트의 중복 아이템은 (itemName + widthM + heightM) 기준으로 제거
  await prisma.projectItem.deleteMany({ where: { projectId: { in: incomingIds } } });

  const seenItemKey = new Set<string>();
  const itemData: {
    projectId: number; itemName: string; itemCategory: string | null;
    widthM: number; heightM: number; quantity: number; marginRate: number;
    unitAreaSqm: number; totalAreaSqm: number;
  }[] = [];

  for (const v of valid) {
    const itemName = v.row.item?.trim() || v.row.projectCode;
    if (!itemName) continue;
    const key = `${v.row.projectCode}|${itemName}|${v.widthM}|${v.heightM}`;
    if (seenItemKey.has(key)) continue;
    seenItemKey.add(key);

    const unitAreaSqm = v.widthM * v.heightM;
    const totalAreaSqm = unitAreaSqm * v.quantity * (1 + v.marginRate / 100);
    itemData.push({
      projectId: projectIdMap.get(v.row.projectCode)!,
      itemName,
      itemCategory: v.row.productGroup?.trim() || null,
      widthM: v.widthM,
      heightM: v.heightM,
      quantity: v.quantity,
      marginRate: v.marginRate,
      unitAreaSqm,
      totalAreaSqm,
    });
  }

  for (let i = 0; i < itemData.length; i += CHUNK) {
    await prisma.projectItem.createMany({ data: itemData.slice(i, i + CHUNK) });
  }

  const result = { deletedProjects, deletedAssignments, assignmentsUpserted };

  console.log(`sync: ${projectRows.size} projects, ${result.assignmentsUpserted} assignments, ${skipped} skipped, ${result.deletedProjects} stale deleted`);
  return {
    projectsUpserted: projectRows.size,
    assignmentsUpserted: result.assignmentsUpserted,
    skipped,
    skippedByReason,
    skippedSamples,
    projectsDeleted: result.deletedProjects,
    assignmentsDeleted: result.deletedAssignments,
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
    const message = getSheetFetchErrorMessage(err);
    console.error(`Project sheet sync failed: ${message}`);
    return { source: 'error', projectsUpserted: 0, assignmentsUpserted: 0, skipped: 0, error: message };
  }

  const rows: ProjectRow[] = [];
  let lineIndex = 0;
  for (const rawLine of csvText.split('\n')) {
    lineIndex++;
    if (lineIndex <= 2) continue; // 헤더 2행 스킵

    const cols = parseCSVRow(rawLine.replace(/\r$/, ''));
    if (cols.length < 30) continue;

    // 컬럼 인덱스 (0-based)
    // 0=순번, 1=프로젝트코드, 2=사업부구분, 3=발주처, 4=ITEM, 5=제품군
    // 12=SHOP(공장), 15=변경납기일, 26=착수일, 27=가로(m), 28=세로(m), 29=작업동
    // 30=수량, 31=여유율(%), 32=2구간시작, 33=2구간종료, 34=2구간가로, 35=2구간세로
    const projectCode = cols[1].trim();
    if (!projectCode || projectCode === '프로젝트코드') continue;

    const shopName    = cols[12]?.trim() ?? '';
    const endDateStr  = cols[15]?.trim() ?? '';
    const startDateStr= cols[26]?.trim() ?? '';
    const widthM      = cols[27]?.trim() ?? '';
    const heightM     = cols[28]?.trim() ?? '';
    const zoneName    = cols[29]?.trim() ?? '';
    const quantity    = cols[30]?.trim() ?? '';
    const marginRate  = cols[31]?.trim() ?? '';
    const phase2Start = cols[32]?.trim() ?? '';
    const phase2End   = cols[33]?.trim() ?? '';
    const phase2Width = cols[34]?.trim() ?? '';
    const phase2Height= cols[35]?.trim() ?? '';

    if (!shopName || !zoneName || !endDateStr || !startDateStr) continue;

    rows.push({
      projectCode,
      division:     cols[2]?.trim() ?? '',
      client:       cols[3]?.trim() ?? '',
      item:         cols[4]?.trim() ?? '',
      productGroup: cols[5]?.trim() ?? '',
      shopName, endDate: endDateStr, startDate: startDateStr,
      widthM: widthM || undefined,
      heightM: heightM || undefined,
      quantity: quantity || undefined,
      marginRate: marginRate || undefined,
      zoneName,
      phase2Start: phase2Start || undefined,
      phase2End: phase2End || undefined,
      phase2Width: phase2Width || undefined,
      phase2Height: phase2Height || undefined,
    });
  }

  const result = await upsertProjectRows(rows);
  return { source: 'sheets', ...result };
}
