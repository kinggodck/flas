import prisma from '../lib/prisma';
import { Router } from 'express';
import { getLoadRateByPeriod } from '../services/loadCalculator';

const router = Router();

// GET /api/gantt/factory/:factoryId?start=&end=&division=
router.get('/factory/:factoryId', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.factoryId);
    const start = new Date(String(req.query.start ?? ''));
    const end = new Date(String(req.query.end ?? ''));
    const divisionFilter = req.query.division ? String(req.query.division) : null;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
      return;
    }

    const zones = await prisma.zone.findMany({
      where: { factoryId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const result = await Promise.all(
      zones.map(async zone => {
        const assignments = await prisma.areaAssignment.findMany({
          where: {
            zoneId: zone.id,
            startDate: { lte: end },
            endDate: { gte: start },
          },
          include: {
            project: true,
            segments: { orderBy: { phaseNo: 'asc' } },
          },
          orderBy: { startDate: 'asc' },
        });

        // 사업부문 필터
        const filtered = divisionFilter
          ? assignments.filter(a => a.project.businessDivision === divisionFilter)
          : assignments;

        const days = await getLoadRateByPeriod(zone.id, start, end);

        return {
          zone: {
            id: zone.id,
            name: zone.name,
            availableAreaSqm: Number(zone.availableAreaSqm),
            usageType: zone.usageType,
          },
          assignments: filtered.map(a => ({
            id: a.id,
            projectId: a.projectId,
            projectNo: a.project.projectNo,
            clientName: a.project.clientName,
            businessDivision: a.project.businessDivision,
            startDate: a.startDate.toISOString().slice(0, 10),
            endDate: a.endDate.toISOString().slice(0, 10),
            requiredAreaSqm: Number(a.requiredAreaSqm),
            widthM: a.widthM ? Number(a.widthM) : null,
            heightM: a.heightM ? Number(a.heightM) : null,
            quantity: a.quantity,
            marginRate: a.marginRate,
            status: a.status,
            notes: a.notes,
            // 2구간 세그먼트
            segments: a.segments.map(s => ({
              phaseNo: s.phaseNo,
              startDate: s.startDate.toISOString().slice(0, 10),
              endDate: s.endDate.toISOString().slice(0, 10),
              widthM: Number(s.widthM),
              heightM: Number(s.heightM),
              quantity: s.quantity,
              marginRate: Number(s.marginRate),
              calculatedAreaSqm: Number(s.calculatedAreaSqm),
            })),
          })),
          days,
          maxLoadRate: days.length > 0 ? Math.max(...days.map(d => d.loadRate)) : 0,
        };
      })
    );

    res.json(result);
  } catch (e) { next(e); }
});

export default router;
