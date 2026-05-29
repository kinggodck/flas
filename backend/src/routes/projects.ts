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
          include: { zone: { include: { factory: true } }, segments: { orderBy: { phaseNo: 'asc' } } },
          orderBy: { startDate: 'asc' },
        },
        items: { orderBy: { totalAreaSqm: 'desc' } },
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
      include: {
        assignments: { include: { zone: { include: { factory: true } }, segments: { orderBy: { phaseNo: 'asc' } } } },
        items: { orderBy: { totalAreaSqm: 'desc' } },
      },
    });
    res.json(project);
  } catch (e) { next(e); }
});

// POST /api/projects
router.post('/', async (req, res, next) => {
  try {
    const { projectNo, clientName, description, businessDivision } = req.body;
    const project = await prisma.project.create({ data: { projectNo, clientName, description, businessDivision } });
    res.status(201).json(project);
  } catch (e) { next(e); }
});

// PUT /api/projects/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { clientName, description, status, businessDivision } = req.body;
    const project = await prisma.project.update({
      where: { id: Number(req.params.id) },
      data: { clientName, description, status, businessDivision },
    });
    res.json(project);
  } catch (e) { next(e); }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.areaDemandSegment.deleteMany({ where: { assignment: { projectId: id } } });
    await prisma.areaAssignment.deleteMany({ where: { projectId: id } });
    await prisma.projectItem.deleteMany({ where: { projectId: id } });
    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/projects/:id/assignments
router.get('/:id/assignments', async (req, res, next) => {
  try {
    const assignments = await prisma.areaAssignment.findMany({
      where: { projectId: Number(req.params.id) },
      include: { zone: { include: { factory: true } }, segments: { orderBy: { phaseNo: 'asc' } } },
      orderBy: { startDate: 'asc' },
    });
    res.json(assignments);
  } catch (e) { next(e); }
});

// POST /api/projects/:id/assignments  — 충돌 검증 포함
router.post('/:id/assignments', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const {
      zoneId, startDate, endDate, widthM, heightM, quantity = 1, marginRate = 0,
      notes, force,
      // 2구간 옵션
      phase2Start, phase2End, phase2Width, phase2Height, phase2Quantity,
    } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const w = Number(widthM) || 0;
    const h = Number(heightM) || 0;
    const qty = Number(quantity);
    const mr = Number(marginRate);

    if (!w || !h) {
      res.status(400).json({ error: '가로(widthM)와 세로(heightM)는 필수입니다.' });
      return;
    }

    const area = w * h * qty * (1 + mr / 100);

    const validation = await validateAssignment(Number(zoneId), start, end, area);
    if (validation.hasConflict && !force) {
      res.status(409).json({ error: 'CONFLICT', message: `면적 초과: 최대 ${validation.maxLoadRate.toFixed(1)}% 부하`, validation });
      return;
    }

    const assignment = await prisma.$transaction(async tx => {
      const a = await tx.areaAssignment.create({
        data: {
          projectId, zoneId: Number(zoneId), startDate: start, endDate: end,
          requiredAreaSqm: area, widthM: w, heightM: h, quantity: qty, marginRate: mr, notes,
        },
      });

      // 2구간 세그먼트
      if (phase2Start && phase2End && phase2Width && phase2Height) {
        const p2Start = new Date(phase2Start);
        const p2End = new Date(phase2End);
        const p2W = Number(phase2Width);
        const p2H = Number(phase2Height);
        const p2Q = Number(phase2Quantity ?? qty);
        if (p2W && p2H && !isNaN(p2Start.getTime()) && !isNaN(p2End.getTime())) {
          const p1End = new Date(p2Start);
          p1End.setDate(p1End.getDate() - 1);
          await tx.areaDemandSegment.createMany({
            data: [
              { assignmentId: a.id, phaseNo: 1, startDate: start, endDate: p1End, widthM: w, heightM: h, quantity: qty, marginRate: mr, calculatedAreaSqm: area },
              { assignmentId: a.id, phaseNo: 2, startDate: p2Start, endDate: p2End, widthM: p2W, heightM: p2H, quantity: p2Q, marginRate: mr, calculatedAreaSqm: p2W * p2H * p2Q * (1 + mr / 100) },
            ],
          });
        }
      }

      return tx.areaAssignment.findUniqueOrThrow({
        where: { id: a.id },
        include: { zone: { include: { factory: true } }, segments: { orderBy: { phaseNo: 'asc' } } },
      });
    });

    res.status(201).json({ assignment, validation });
  } catch (e) { next(e); }
});

// ── ProjectItem CRUD ────────────────────────────────────

// GET /api/projects/:id/items
router.get('/:id/items', async (req, res, next) => {
  try {
    const items = await prisma.projectItem.findMany({
      where: { projectId: Number(req.params.id) },
      orderBy: { createdAt: 'asc' },
    });
    res.json(items);
  } catch (e) { next(e); }
});

// POST /api/projects/:id/items
router.post('/:id/items', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const { itemName, itemCategory, widthM, heightM, quantity = 1, marginRate = 0 } = req.body;
    const w = Number(widthM);
    const h = Number(heightM);
    const qty = Number(quantity);
    const mr = Number(marginRate);
    const unitAreaSqm = w * h;
    const totalAreaSqm = unitAreaSqm * qty * (1 + mr / 100);

    const item = await prisma.projectItem.create({
      data: { projectId, itemName, itemCategory, widthM: w, heightM: h, quantity: qty, marginRate: mr, unitAreaSqm, totalAreaSqm },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/projects/:id/items/:itemId
router.put('/:id/items/:itemId', async (req, res, next) => {
  try {
    const { itemName, itemCategory, widthM, heightM, quantity = 1, marginRate = 0 } = req.body;
    const w = Number(widthM);
    const h = Number(heightM);
    const qty = Number(quantity);
    const mr = Number(marginRate);
    const unitAreaSqm = w * h;
    const totalAreaSqm = unitAreaSqm * qty * (1 + mr / 100);

    const item = await prisma.projectItem.update({
      where: { id: Number(req.params.itemId) },
      data: { itemName, itemCategory, widthM: w, heightM: h, quantity: qty, marginRate: mr, unitAreaSqm, totalAreaSqm },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/projects/:id/items/:itemId
router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    await prisma.projectItem.delete({ where: { id: Number(req.params.itemId) } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
