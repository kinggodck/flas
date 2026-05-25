import prisma from '../lib/prisma';
import { Router, Request, Response, NextFunction } from 'express';

import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/factories
router.get('/', async (_req, res, next) => {
  try {
    const factories = await prisma.factory.findMany({
      include: { zones: { orderBy: { name: 'asc' } } },
      orderBy: { code: 'asc' },
    });
    res.json(factories);
  } catch (e) { next(e); }
});

// POST /api/factories
router.post('/', async (req, res, next) => {
  try {
    const { code, name, totalAreaSqm } = req.body;
    const factory = await prisma.factory.create({ data: { code, name, totalAreaSqm } });
    res.status(201).json(factory);
  } catch (e) { next(e); }
});

// PUT /api/factories/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, totalAreaSqm } = req.body;
    const before = await prisma.factory.findUniqueOrThrow({ where: { id } });
    const factory = await prisma.factory.update({ where: { id }, data: { name, totalAreaSqm } });
    if (before.totalAreaSqm?.toString() !== String(totalAreaSqm ?? '')) {
      await prisma.areaChangeLog.create({
        data: { entityType: 'factory', entityId: id, fieldName: 'totalAreaSqm', oldValue: before.totalAreaSqm?.toString(), newValue: String(totalAreaSqm), factoryId: id },
      });
    }
    res.json(factory);
  } catch (e) { next(e); }
});

// DELETE /api/factories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.factory.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/factories/:id/zones
router.get('/:id/zones', async (req, res, next) => {
  try {
    const zones = await prisma.zone.findMany({
      where: { factoryId: Number(req.params.id) },
      orderBy: { name: 'asc' },
    });
    res.json(zones);
  } catch (e) { next(e); }
});

// POST /api/factories/:id/zones
router.post('/:id/zones', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.id);
    const { name, availableAreaSqm, usageType, dimensions } = req.body;
    const zone = await prisma.zone.create({ data: { factoryId, name, availableAreaSqm, usageType, dimensions } });
    res.status(201).json(zone);
  } catch (e) { next(e); }
});

// PUT /api/zones/:id  (별도 라우터에서도 처리하나 여기 포함)
router.put('/zones/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, availableAreaSqm, usageType, dimensions, isActive } = req.body;
    const before = await prisma.zone.findUniqueOrThrow({ where: { id } });
    const zone = await prisma.zone.update({ where: { id }, data: { name, availableAreaSqm, usageType, dimensions, isActive } });
    if (before.availableAreaSqm.toString() !== String(availableAreaSqm)) {
      await prisma.areaChangeLog.create({
        data: { entityType: 'zone', entityId: id, fieldName: 'availableAreaSqm', oldValue: before.availableAreaSqm.toString(), newValue: String(availableAreaSqm), zoneId: id },
      });
    }
    res.json(zone);
  } catch (e) { next(e); }
});

// DELETE /api/factories/zones/:id
router.delete('/zones/:id', async (req, res, next) => {
  try {
    await prisma.zone.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/factories/import  — 엑셀 업로드
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    const created: unknown[] = [];
    for (const row of rows) {
      const code = String(row['공장코드'] ?? '').trim();
      const factoryName = String(row['공장명'] ?? '').trim();
      const zoneName = String(row['구역명'] ?? '').trim();
      const area = Number(row['가용면적(㎡)'] ?? 0);
      if (!code || !factoryName || !zoneName || !area) continue;

      const factory = await prisma.factory.upsert({
        where: { code },
        update: { name: factoryName },
        create: { code, name: factoryName },
      });
      const zone = await prisma.zone.upsert({
        where: { factoryId_name: { factoryId: factory.id, name: zoneName } },
        update: { availableAreaSqm: area },
        create: { factoryId: factory.id, name: zoneName, availableAreaSqm: area, usageType: String(row['용도'] ?? '').trim() || null },
      });
      created.push(zone);
    }
    res.json({ imported: created.length });
  } catch (e) { next(e); }
});

export default router;
