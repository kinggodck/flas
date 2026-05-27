import prisma from '../lib/prisma';




export interface DayLoad {
  date: string;        // YYYY-MM-DD
  occupiedArea: number;
  availableArea: number;
  loadRate: number;    // 0~100+
}

export async function getLoadByDate(zoneId: number, date: Date): Promise<number> {
  const result = await prisma.areaAssignment.aggregate({
    _sum: { requiredAreaSqm: true },
    where: {
      zoneId,
      status: 'confirmed',
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
  return Number(result._sum.requiredAreaSqm ?? 0);
}

export async function getLoadRateByPeriod(
  zoneId: number,
  start: Date,
  end: Date
): Promise<DayLoad[]> {
  const zone = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  const availableArea = Number(zone.availableAreaSqm);

  const assignments = await prisma.areaAssignment.findMany({
    where: {
      zoneId,
      status: 'confirmed',
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  const days: DayLoad[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const occupied = assignments
      .filter((a) => a.startDate <= cur && a.endDate >= cur)
      .reduce((sum: number, a) => sum + Number(a.requiredAreaSqm), 0);
    days.push({
      date: dateStr,
      occupiedArea: occupied,
      availableArea,
      loadRate: availableArea > 0 ? (occupied / availableArea) * 100 : 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function calculateLoadRateByPeriod(
  zone: { id: number; availableAreaSqm: number },
  assignments: { zoneId: number; startDate: Date; endDate: Date; requiredAreaSqm: number }[],
  start: Date,
  end: Date
): DayLoad[] {
  const availableArea = Number(zone.availableAreaSqm);
  const zoneAssignments = assignments.filter((a) => a.zoneId === zone.id);
  const days: DayLoad[] = [];
  const cur = new Date(start);

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const occupied = zoneAssignments
      .filter((a) => a.startDate <= cur && a.endDate >= cur)
      .reduce((sum: number, a) => sum + Number(a.requiredAreaSqm), 0);

    days.push({
      date: dateStr,
      occupiedArea: occupied,
      availableArea,
      loadRate: availableArea > 0 ? (occupied / availableArea) * 100 : 0,
    });
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}
