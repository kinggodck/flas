import prisma from '../lib/prisma';
import { Router } from 'express';

import { validateAssignment } from '../services/conflictValidator';

const router = Router();


// PUT /api/assignments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { zoneId, startDate, endDate, requiredAreaSqm, widthM, heightM, notes, status, force } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const area = Number(requiredAreaSqm);

    const validation = await validateAssignment(Number(zoneId), start, end, area, id);
    if (validation.hasConflict && !force) {
      res.status(409).json({ error: 'CONFLICT', message: `면적 초과: 최대 ${validation.maxLoadRate.toFixed(1)}% 부하`, validation });
      return;
    }

    const assignment = await prisma.areaAssignment.update({
      where: { id },
      data: {
        zoneId: Number(zoneId), startDate: start, endDate: end, requiredAreaSqm: area,
        widthM: widthM !== undefined ? (widthM ? Number(widthM) : null) : undefined,
        heightM: heightM !== undefined ? (heightM ? Number(heightM) : null) : undefined,
        notes, status,
      },
      include: { zone: { include: { factory: true } } },
    });
    res.json({ assignment, validation });
  } catch (e) { next(e); }
});

// DELETE /api/assignments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.areaAssignment.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
