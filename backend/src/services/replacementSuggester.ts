import prisma from '../lib/prisma';

import { validateAssignment } from './conflictValidator';



export interface ReplacementSuggestion {
  zone: { id: number; name: string; availableAreaSqm: number };
  factory: { id: number; name: string };
  maxLoadRateIfMoved: number;
  headroomPct: number;
  hasConflict: boolean;
}

export interface ReplacementResult {
  assignment: {
    id: number;
    zoneId: number;
    zoneName: string;
    factoryId: number;
    factoryName: string;
    startDate: Date;
    endDate: Date;
    requiredAreaSqm: number;
  };
  suggestions: ReplacementSuggestion[];
}

export async function suggestReplacements(assignmentId: number): Promise<ReplacementResult> {
  const assignment = await prisma.areaAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { zone: { include: { factory: true } } },
  });

  const factoryId = assignment.zone.factoryId;
  const candidateZones = await prisma.zone.findMany({
    where: { factoryId, isActive: true, id: { not: assignment.zoneId } },
    include: { factory: true },
  });

  const suggestions: ReplacementSuggestion[] = [];

  for (const zone of candidateZones) {
    const validation = await validateAssignment(
      zone.id,
      assignment.startDate,
      assignment.endDate,
      Number(assignment.requiredAreaSqm)
    );
    const headroomPct = Math.max(0, 100 - validation.maxLoadRate);
    suggestions.push({
      zone: { id: zone.id, name: zone.name, availableAreaSqm: Number(zone.availableAreaSqm) },
      factory: { id: zone.factory.id, name: zone.factory.name },
      maxLoadRateIfMoved: validation.maxLoadRate,
      headroomPct,
      hasConflict: validation.hasConflict,
    });
  }

  // 충돌 없는 것 우선, 그 다음 여유율 높은 순
  suggestions.sort((a, b) => {
    if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
    return b.headroomPct - a.headroomPct;
  });

  return {
    assignment: {
      id: assignment.id,
      zoneId: assignment.zoneId,
      zoneName: assignment.zone.name,
      factoryId,
      factoryName: assignment.zone.factory.name,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      requiredAreaSqm: Number(assignment.requiredAreaSqm),
    },
    suggestions,
  };
}
