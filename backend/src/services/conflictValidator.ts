import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ConflictDay {
  date: string;
  occupiedArea: number;
  availableArea: number;
  loadRate: number;
}

export interface ValidationResult {
  hasConflict: boolean;
  maxLoadRate: number;
  conflictDays: ConflictDay[];
}

export async function validateAssignment(
  zoneId: number,
  startDate: Date,
  endDate: Date,
  requiredAreaSqm: number,
  excludeAssignmentId?: number
): Promise<ValidationResult> {
  const zone = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  const availableArea = Number(zone.availableAreaSqm);

  const existing = await prisma.areaAssignment.findMany({
    where: {
      zoneId,
      status: 'confirmed',
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeAssignmentId ? { NOT: { id: excludeAssignmentId } } : {}),
    },
  });

  const conflictDays: ConflictDay[] = [];
  let maxLoadRate = 0;

  const cur = new Date(startDate);
  while (cur <= endDate) {
    const existingLoad = existing
      .filter((a) => a.startDate <= cur && a.endDate >= cur)
      .reduce((sum, a) => sum + Number(a.requiredAreaSqm), 0);
    const total = existingLoad + requiredAreaSqm;
    const loadRate = availableArea > 0 ? (total / availableArea) * 100 : 0;

    if (loadRate > 100) {
      conflictDays.push({
        date: cur.toISOString().slice(0, 10),
        occupiedArea: total,
        availableArea,
        loadRate,
      });
    }
    if (loadRate > maxLoadRate) maxLoadRate = loadRate;
    cur.setDate(cur.getDate() + 1);
  }

  return { hasConflict: conflictDays.length > 0, maxLoadRate, conflictDays };
}
