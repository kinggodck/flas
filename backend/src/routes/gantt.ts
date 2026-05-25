import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getLoadRateByPeriod } from '../services/loadCalculator';

const router = Router();
const prisma = new PrismaClient();

// GET /api/gantt/factory/:factoryId?start=&end=
router.get('/factory/:factoryId', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.factoryId);
    const start = new Date(String(req.query.start ?? ''));
    const end = new Date(String(req.query.end ?? ''));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
      return;
    }

    const zones = await prisma.zone.findMany({
      where: { factoryId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const result = await Promise.all(
      zones.map(async (zone) => {
        const assignments = await prisma.areaAssignment.findMany({
          where: {
            zoneId: zone.id,
            startDate: { lte: end },
            endDate: { gte: start },
          },
          include: { project: true },
          orderBy: { startDate: 'asc' },
        });

        const days = await getLoadRateByPeriod(zone.id, start, end);

        return {
          zone: {
            id: zone.id,
            name: zone.name,
            availableAreaSqm: Number(zone.availableAreaSqm),
          },
          assignments: assignments.map((a) => ({
            id: a.id,
            projectId: a.projectId,
            projectNo: a.project.projectNo,
            clientName: a.project.clientName,
            startDate: a.startDate.toISOString().slice(0, 10),
            endDate: a.endDate.toISOString().slice(0, 10),
            requiredAreaSqm: Number(a.requiredAreaSqm),
            widthM: a.widthM ? Number(a.widthM) : null,
            heightM: a.heightM ? Number(a.heightM) : null,
            status: a.status,
            notes: a.notes,
          })),
          days,
          maxLoadRate: days.length > 0 ? Math.max(...days.map((d) => d.loadRate)) : 0,
        };
      })
    );

    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
