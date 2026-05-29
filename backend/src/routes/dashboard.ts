import prisma from '../lib/prisma';
import { Router } from 'express';
import { calculateLoadRateByPeriod } from '../services/loadCalculator';

const router = Router();

function utcDate(year: number, month: number, day: number): Date {
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// GET /api/dashboard?year=2025
router.get('/', async (req, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());

    const factories = await prisma.factory.findMany({
      include: { zones: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
    const zones = factories.flatMap(f => f.zones);
    const zoneIds = zones.map(z => z.id);
    const yearStart = utcDate(year, 1, 1);
    const yearEnd = utcDate(year, 12, 31);

    const assignments = zoneIds.length > 0
      ? await prisma.areaAssignment.findMany({
          where: { zoneId: { in: zoneIds }, status: 'confirmed', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
          select: { zoneId: true, startDate: true, endDate: true, requiredAreaSqm: true, segments: { select: { startDate: true, endDate: true, calculatedAreaSqm: true } } },
        })
      : [];

    const activeProjects = await prisma.project.count({ where: { status: 'active', assignments: { some: { status: 'confirmed', endDate: { gte: new Date() } } } } });

    const monthRanges = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { month: m, start: utcDate(year, m, 1), end: utcDate(year, m, daysInMonth(year, m)) };
    });

    interface ZoneMonthResult {
      factoryId: number; factoryName: string;
      zoneId: number; zoneName: string;
      month: number; maxLoadRate: number; avgLoadRate: number; riskDayCount: number;
    }

    const zoneMonthResults: ZoneMonthResult[] = factories.flatMap(factory =>
      factory.zones.flatMap(zone =>
        monthRanges.map(({ month, start, end }) => {
          const days = calculateLoadRateByPeriod(zone, assignments, start, end);
          const rates = days.map(d => d.loadRate);
          return {
            factoryId: factory.id, factoryName: factory.name,
            zoneId: zone.id, zoneName: zone.name,
            month,
            maxLoadRate: rates.length > 0 ? Math.max(...rates) : 0,
            avgLoadRate: rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0,
            riskDayCount: days.filter(d => d.loadRate > 100).length,
          };
        })
      )
    );

    const heatmap = factories.map(factory => ({
      factoryId: factory.id,
      factoryName: factory.name,
      months: monthRanges.map(({ month }) => {
        const entries = zoneMonthResults.filter(r => r.factoryId === factory.id && r.month === month);
        if (entries.length === 0) return { month, maxLoadRate: 0, avgLoadRate: 0 };
        return {
          month,
          maxLoadRate: Math.max(...entries.map(e => e.maxLoadRate)),
          avgLoadRate: entries.reduce((s, e) => s + e.avgLoadRate, 0) / entries.length,
        };
      }),
    }));

    const allAvgRates = zoneMonthResults.map(r => r.avgLoadRate);
    const avgLoadRate = allAvgRates.length > 0 ? allAvgRates.reduce((s, r) => s + r, 0) / allAvgRates.length : 0;
    const riskDays = zoneMonthResults.reduce((s, r) => s + r.riskDayCount, 0);
    const peakEntry = zoneMonthResults.reduce<ZoneMonthResult | null>(
      (best, cur) => (best === null || cur.maxLoadRate > best.maxLoadRate ? cur : best), null
    );
    const peakZone = peakEntry
      ? { factoryName: peakEntry.factoryName, zoneName: peakEntry.zoneName, month: peakEntry.month, maxLoadRate: peakEntry.maxLoadRate }
      : null;

    res.json({ kpi: { avgLoadRate, peakZone, riskDays, activeProjects }, heatmap });
  } catch (e) { next(e); }
});

// GET /api/dashboard/factory/:id/month?year=2025&month=6
router.get('/factory/:id/month', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.id);
    const year = Number(req.query.year ?? new Date().getFullYear());
    const month = Number(req.query.month ?? new Date().getMonth() + 1);

    const factory = await prisma.factory.findUniqueOrThrow({ where: { id: factoryId } });
    const zones = await prisma.zone.findMany({ where: { factoryId, isActive: true }, orderBy: { name: 'asc' } });

    const dim = daysInMonth(year, month);
    const start = utcDate(year, month, 1);
    const end = utcDate(year, month, dim);
    const zoneIds = zones.map(z => z.id);

    const assignments = zoneIds.length > 0
      ? await prisma.areaAssignment.findMany({
          where: { zoneId: { in: zoneIds }, status: 'confirmed', startDate: { lte: end }, endDate: { gte: start } },
          select: { zoneId: true, startDate: true, endDate: true, requiredAreaSqm: true, segments: { select: { startDate: true, endDate: true, calculatedAreaSqm: true } } },
        })
      : [];

    const zoneData = zones.map(zone => {
      const days = calculateLoadRateByPeriod(zone, assignments, start, end);
      const rates = days.map(d => d.loadRate);
      return {
        zoneId: zone.id, zoneName: zone.name, availableAreaSqm: Number(zone.availableAreaSqm),
        maxLoadRate: rates.length > 0 ? Math.max(...rates) : 0,
        avgLoadRate: rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0,
        days,
      };
    });

    const dailySummary = Array.from({ length: dim }, (_, i) => {
      const dateStr = utcDate(year, month, i + 1).toISOString().slice(0, 10);
      let totalRate = 0, peakZone = '', peakLoadRate = 0, count = 0;
      for (const z of zoneData) {
        const day = z.days.find(d => d.date === dateStr);
        if (day) {
          totalRate += day.loadRate; count++;
          if (day.loadRate > peakLoadRate) { peakLoadRate = day.loadRate; peakZone = z.zoneName; }
        }
      }
      return { date: dateStr, avgLoadRate: count > 0 ? totalRate / count : 0, peakZone, peakLoadRate };
    });

    res.json({ factoryName: factory.name, year, month, zones: zoneData, dailySummary });
  } catch (e) { next(e); }
});

// GET /api/dashboard/divisions?year=2025
// 사업부문별 면적 점유 집계
router.get('/divisions', async (req, res, next) => {
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const yearStart = utcDate(year, 1, 1);
    const yearEnd = utcDate(year, 12, 31);

    const projects = await prisma.project.findMany({
      where: { status: 'active' },
      include: {
        assignments: {
          where: { status: 'confirmed', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
          include: { zone: { include: { factory: true } }, segments: true },
        },
      },
    });

    // 사업부문별 집계
    const divisionMap = new Map<string, { totalAreaSqm: number; projectCount: number; projects: { projectNo: string; clientName: string | null; totalArea: number }[] }>();

    for (const proj of projects) {
      const bu = proj.businessDivision ?? '미분류';
      if (!divisionMap.has(bu)) divisionMap.set(bu, { totalAreaSqm: 0, projectCount: 0, projects: [] });
      const entry = divisionMap.get(bu)!;

      let projArea = 0;
      for (const a of proj.assignments) {
        projArea += Number(a.requiredAreaSqm);
      }
      entry.totalAreaSqm += projArea;
      entry.projectCount++;
      entry.projects.push({ projectNo: proj.projectNo, clientName: proj.clientName, totalArea: projArea });
    }

    // 전체 면적
    const grandTotal = [...divisionMap.values()].reduce((s, v) => s + v.totalAreaSqm, 0);

    // 월별 추이 (스택 바차트용)
    const monthRanges = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, start: utcDate(year, i + 1, 1), end: utcDate(year, i + 1, daysInMonth(year, i + 1)) }));

    const monthlyTrend = monthRanges.map(({ month, start, end }) => {
      const buBreakdown: Record<string, number> = {};
      for (const proj of projects) {
        const bu = proj.businessDivision ?? '미분류';
        let area = 0;
        for (const a of proj.assignments) {
          if (a.startDate <= end && a.endDate >= start) {
            area += Number(a.requiredAreaSqm);
          }
        }
        if (area > 0) buBreakdown[bu] = (buBreakdown[bu] ?? 0) + area;
      }
      return { month, buBreakdown };
    });

    const divisions = [...divisionMap.entries()].map(([name, v]) => ({
      name,
      totalAreaSqm: v.totalAreaSqm,
      percentage: grandTotal > 0 ? (v.totalAreaSqm / grandTotal) * 100 : 0,
      projectCount: v.projectCount,
      projects: v.projects.sort((a, b) => b.totalArea - a.totalArea).slice(0, 10),
    })).sort((a, b) => b.totalAreaSqm - a.totalAreaSqm);

    res.json({ year, grandTotal, divisions, monthlyTrend });
  } catch (e) { next(e); }
});

// GET /api/dashboard/items?limit=20
// 아이템별 면적 점유 랭킹
router.get('/items', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 20);

    const items = await prisma.projectItem.findMany({
      include: { project: { include: { assignments: { include: { zone: { include: { factory: true } } } } } } },
      orderBy: { totalAreaSqm: 'desc' },
      take: limit,
    });

    const result = items.map((item, idx) => ({
      rank: idx + 1,
      id: item.id,
      itemName: item.itemName,
      itemCategory: item.itemCategory,
      projectNo: item.project.projectNo,
      clientName: item.project.clientName,
      businessDivision: item.project.businessDivision,
      widthM: Number(item.widthM),
      heightM: Number(item.heightM),
      quantity: item.quantity,
      marginRate: Number(item.marginRate),
      unitAreaSqm: Number(item.unitAreaSqm),
      totalAreaSqm: Number(item.totalAreaSqm),
      zones: item.project.assignments.map(a => ({
        factoryName: a.zone.factory.name,
        zoneName: a.zone.name,
        startDate: a.startDate.toISOString().slice(0, 10),
        endDate: a.endDate.toISOString().slice(0, 10),
      })),
    }));

    res.json({ items: result, total: await prisma.projectItem.count() });
  } catch (e) { next(e); }
});

export default router;
