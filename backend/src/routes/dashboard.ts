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

// GET /api/dashboard/items?year=2026&limit=50
// 해당 연도에 배치(사용)된 아이템별 면적 집계
router.get('/items', async (req, res, next) => {
  try {
    const year  = Number(req.query.year  ?? new Date().getFullYear());
    const limit = Number(req.query.limit ?? 50);
    const yearStart = utcDate(year, 1, 1);
    const yearEnd   = utcDate(year, 12, 31);

    // orphan 정리: project가 삭제됐지만 item이 남은 경우 raw SQL로 제거
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ProjectItem" WHERE "projectId" NOT IN (SELECT id FROM "Project")`
    ).catch(() => { /* 테이블 없거나 이미 정리됨 — 무시 */ });

    // 해당 연도에 배치(AreaAssignment)가 있는 프로젝트의 아이템만 조회
    const items = await prisma.projectItem.findMany({
      where: {
        project: {
          assignments: {
            some: {
              status: 'confirmed',
              startDate: { lte: yearEnd },
              endDate:   { gte: yearStart },
            },
          },
        },
      },
      include: {
        project: {
          include: {
            assignments: {
              where: {
                status: 'confirmed',
                startDate: { lte: yearEnd },
                endDate:   { gte: yearStart },
              },
              include: { zone: { include: { factory: true } } },
            },
          },
        },
      },
      orderBy: { totalAreaSqm: 'desc' },
      take: limit,
    });

    const result = items.filter(item => item.project != null).map((item, idx) => ({
      rank: idx + 1,
      id: item.id,
      itemName: item.itemName,
      itemCategory: item.itemCategory,
      projectNo: item.project!.projectNo,
      clientName: item.project!.clientName,
      businessDivision: item.project!.businessDivision,
      widthM: Number(item.widthM),
      heightM: Number(item.heightM),
      quantity: item.quantity,
      marginRate: Number(item.marginRate),
      unitAreaSqm: Number(item.unitAreaSqm),
      totalAreaSqm: Number(item.totalAreaSqm),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zones: (item.project!.assignments as any[]).map((a) => ({
        factoryName: a.zone.factory.name,
        zoneName: a.zone.name,
        startDate: a.startDate.toISOString().slice(0, 10),
        endDate: a.endDate.toISOString().slice(0, 10),
      })),
    }));

    const total = await prisma.projectItem.count({
      where: {
        project: {
          assignments: {
            some: { status: 'confirmed', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
          },
        },
      },
    });

    // 전체 공장 가용 면적 합계 (모든 활성 구역)
    const allZones = await prisma.zone.findMany({ where: { isActive: true }, select: { availableAreaSqm: true } });
    const totalAvailableArea = allZones.reduce((s, z) => s + Number(z.availableAreaSqm), 0);

    // 해당 연도 배치된 총 점유 면적 (AreaAssignment 기준 — 아이템이 없는 프로젝트 포함)
    const allAssignments = await prisma.areaAssignment.findMany({
      where: { status: 'confirmed', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
      select: { requiredAreaSqm: true },
    });
    const totalAssignedArea = allAssignments.reduce((s, a) => s + Number(a.requiredAreaSqm), 0);

    // 아이템별 할당 면적 합계
    const grandTotalArea = result.reduce((s, i) => s + i.totalAreaSqm, 0);

    res.json({
      year,
      items: result,
      total,
      grandTotalArea,          // 아이템별 면적 합계
      totalAssignedArea,       // 전체 배치 면적 합계 (AreaAssignment 기준)
      totalAvailableArea,      // 전체 공장 가용 면적
      utilizationRate: totalAvailableArea > 0 ? (totalAssignedArea / totalAvailableArea) * 100 : 0,
    });
  } catch (e) { next(e); }
});

export default router;
