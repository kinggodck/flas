import prisma from '../lib/prisma';

export interface DayLoad {
  date: string;        // YYYY-MM-DD
  occupiedArea: number;
  availableArea: number;
  loadRate: number;    // 0~100+
}

// 날짜 기준 면적 결정: 세그먼트가 있으면 해당 날짜의 활성 세그먼트 면적 사용
function effectiveArea(
  a: {
    startDate: Date; endDate: Date; requiredAreaSqm: number;
    segments: { startDate: Date; endDate: Date; calculatedAreaSqm: number }[];
  },
  cur: Date,
): number {
  if (a.segments.length > 0) {
    const seg = a.segments.find(s => s.startDate <= cur && s.endDate >= cur);
    return seg ? Number(seg.calculatedAreaSqm) : 0;
  }
  return Number(a.requiredAreaSqm);
}

export async function getLoadByDate(zoneId: number, date: Date): Promise<number> {
  const assignments = await prisma.areaAssignment.findMany({
    where: {
      zoneId,
      status: 'confirmed',
      startDate: { lte: date },
      endDate:   { gte: date },
    },
    include: { segments: true },
  });
  return assignments.reduce((sum, a) => sum + effectiveArea(a, date), 0);
}

export async function getLoadRateByPeriod(zoneId: number, start: Date, end: Date): Promise<DayLoad[]> {
  const zone = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  const availableArea = Number(zone.availableAreaSqm);

  const assignments = await prisma.areaAssignment.findMany({
    where: { zoneId, status: 'confirmed', startDate: { lte: end }, endDate: { gte: start } },
    include: { segments: true },
  });

  const days: DayLoad[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const occupied = assignments
      .filter(a => a.startDate <= cur && a.endDate >= cur)
      .reduce((sum, a) => sum + effectiveArea(a, cur), 0);
    days.push({ date: dateStr, occupiedArea: occupied, availableArea, loadRate: availableArea > 0 ? (occupied / availableArea) * 100 : 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// 미리 조회된 배치 목록으로 계산 (대시보드 배치 최적화용)
export function calculateLoadRateByPeriod(
  zone: { id: number; availableAreaSqm: number },
  assignments: { zoneId: number; startDate: Date; endDate: Date; requiredAreaSqm: number; segments?: { startDate: Date; endDate: Date; calculatedAreaSqm: number }[] }[],
  start: Date,
  end: Date,
): DayLoad[] {
  const availableArea = Number(zone.availableAreaSqm);
  const zoneAssignments = assignments.filter(a => a.zoneId === zone.id);
  const days: DayLoad[] = [];
  const cur = new Date(start);

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const occupied = zoneAssignments
      .filter(a => a.startDate <= cur && a.endDate >= cur)
      .reduce((sum, a) => {
        const segs = a.segments ?? [];
        return sum + (segs.length > 0
          ? (segs.find(s => s.startDate <= cur && s.endDate >= cur)?.calculatedAreaSqm ?? 0)
          : Number(a.requiredAreaSqm));
      }, 0);

    days.push({ date: dateStr, occupiedArea: occupied, availableArea, loadRate: availableArea > 0 ? (occupied / availableArea) * 100 : 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
