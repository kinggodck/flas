import prisma from '../lib/prisma';
import { Router } from 'express';
import { getLoadRateByPeriod } from '../services/loadCalculator';
import { suggestReplacements } from '../services/replacementSuggester';


const router = Router();


// POST /api/load/check — 기간·구역 부하율 계산
router.post('/check', async (req, res, next) => {
  try {
    const { zoneId, startDate, endDate } = req.body;
    const days = await getLoadRateByPeriod(Number(zoneId), new Date(startDate), new Date(endDate));
    const maxLoadRate = Math.max(...days.map((d) => d.loadRate), 0);
    res.json({ zoneId: Number(zoneId), days, maxLoadRate });
  } catch (e) { next(e); }
});

// GET /api/load/factory/:factoryId?start=&end=  — 공장 전체 구역 부하 요약
router.get('/factory/:factoryId', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.factoryId);
    const start = new Date(String(req.query.start ?? ''));
    const end = new Date(String(req.query.end ?? ''));
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const zones = await prisma.zone.findMany({ where: { factoryId, isActive: true } });
    const results = await Promise.all(
      zones.map(async (z) => {
        const days = await getLoadRateByPeriod(z.id, start, end);
        const maxLoadRate = Math.max(...days.map((d) => d.loadRate), 0);
        return { zoneId: z.id, zoneName: z.name, maxLoadRate, days };
      })
    );
    res.json(results);
  } catch (e) { next(e); }
});

// POST /api/load/suggest-replacement
router.post('/suggest-replacement', async (req, res, next) => {
  try {
    const { assignmentId } = req.body;
    const result = await suggestReplacements(Number(assignmentId));
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
