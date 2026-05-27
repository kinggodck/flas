import prisma from '../lib/prisma';
import { Router } from 'express';

import { validateAssignment } from '../services/conflictValidator';

const router = Router();


// GET /api/projects
router.get('/', async (_req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        assignments: {
          include: { zone: { include: { factory: true } } },
          orderBy: { startDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (e) { next(e); }
});

// GET /api/projects/:id
router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: Number(req.params.id) },
      include: { assignments: { include: { zone: { include: { factory: true } } } } },
    });
    res.json(project);
  } catch (e) { next(e); }
});

// POST /api/projects
router.post('/', async (req, res, next) => {
  try {
    const { projectNo, clientName, description } = req.body;
    const project = await prisma.project.create({ data: { projectNo, clientName, description } });
    res.status(201).json(project);
  } catch (e) { next(e); }
});

// PUT /api/projects/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { clientName, description, status } = req.body;
    const project = await prisma.project.update({
      where: { id: Number(req.params.id) },
      data: { clientName, description, status },
    });
    res.json(project);
  } catch (e) { next(e); }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.areaAssignment.deleteMany({ where: { projectId: id } });
    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/projects/:id/assignments
router.get('/:id/assignments', async (req, res, next) => {
  try {
    const assignments = await prisma.areaAssignment.findMany({
      where: { projectId: Number(req.params.id) },
      include: { zone: { include: { factory: true } } },
      orderBy: { startDate: 'asc' },
    });
    res.json(assignments);
  } catch (e) { next(e); }
});

// POST /api/projects/:id/assignments  — 충돌 검증 포함
router.post('/:id/assignments', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const { zoneId, startDate, endDate, requiredAreaSqm, widthM, heightM, notes, force } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const area = Number(requiredAreaSqm);

    const validation = await validateAssignment(Number(zoneId), start, end, area);

    if (validation.hasConflict && !force) {
      res.status(409).json({
        error: 'CONFLICT',
        message: `면적 초과: 최대 ${validation.maxLoadRate.toFixed(1)}% 부하`,
        validation,
      });
      return;
    }

    const assignment = await prisma.areaAssignment.create({
      data: {
        projectId, zoneId: Number(zoneId), startDate: start, endDate: end, requiredAreaSqm: area,
        widthM: widthM ? Number(widthM) : null,
        heightM: heightM ? Number(heightM) : null,
        notes,
      },
      include: { zone: { include: { factory: true } } },
    });
    res.status(201).json({ assignment, validation });
  } catch (e) { next(e); }
});

export default router;
