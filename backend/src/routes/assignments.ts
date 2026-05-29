import prisma from '../lib/prisma';
import { Router } from 'express';
import { validateAssignment } from '../services/conflictValidator';

const router = Router();

// PUT /api/assignments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { zoneId, startDate, endDate, widthM, heightM, quantity, marginRate, notes, status, force } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const w = Number(widthM) || 0;
    const h = Number(heightM) || 0;
    const qty = Number(quantity ?? 1);
    const mr = Number(marginRate ?? 0);
    const area = w && h ? w * h * qty * (1 + mr / 100) : 0;

    if (!area) {
      res.status(400).json({ error: '가로(widthM)와 세로(heightM)는 필수입니다.' });
      return;
    }

    const validation = await validateAssignment(Number(zoneId), start, end, area, id);
    if (validation.hasConflict && !force) {
      res.status(409).json({ error: 'CONFLICT', message: `면적 초과: 최대 ${validation.maxLoadRate.toFixed(1)}% 부하`, validation });
      return;
    }

    const assignment = await prisma.areaAssignment.update({
      where: { id },
      data: {
        zoneId: Number(zoneId), startDate: start, endDate: end,
        requiredAreaSqm: area, widthM: w, heightM: h, quantity: qty, marginRate: mr,
        notes, status,
      },
      include: { zone: { include: { factory: true } }, segments: { orderBy: { phaseNo: 'asc' } } },
    });
    res.json({ assignment, validation });
  } catch (e) { next(e); }
});

// DELETE /api/assignments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.areaDemandSegment.deleteMany({ where: { assignmentId: id } });
    await prisma.areaAssignment.delete({ where: { id } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
