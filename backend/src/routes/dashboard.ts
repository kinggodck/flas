import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getLoadRateByPeriod } from '../services/loadCalculator';

const router = Router();
const prisma = new PrismaClient();

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

    const monthRanges = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { month: m, start: utcDate(year, m, 1), end: utcDate(year, m, daysInMonth(year, m)) };
    });

    // Single pass: factory → zone → month → DayLoad[]
    // Accumulate heatmap, peakZone, riskDays simultaneously
    interface ZoneMonthResult {
      factoryId: number;
      factoryName: string;
      zoneId: number;
      zoneName: string;
      month: number;
      maxLoadRate: number;
      avgLoadRate: number;
      riskDayCount: number;
    }

    const zoneMonthResults: ZoneMonthResult[] = await Promise.all(
      factories.flatMap((factory) =>
        factory.zones.flatMap((zone) =>
          monthRanges.map(async ({ month, start, end }) => {
            const days = await getLoadRateByPeriod(zone.id, start, end);
            const rates = days.map((d) => d.loadRate);
            const maxLoadRate = rates.length > 0 ? Math.max(...rates) : 0;
            const avgLoadRate =
              rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
            const riskDayCount = days.filter((d) => d.loadRate > 100).length;
            return {
              factoryId: factory.id,
              factoryName: factory.name,
              zoneId: zone.id,
              zoneName: zone.name,
              month,
              maxLoadRate,
              avgLoadRate,
              riskDayCount,
            };
          })
        )
      )
    );

    // Build heatmap
    const heatmap = factories.map((factory) => {
      const months = monthRanges.map(({ month }) => {
        const entries = zoneMonthResults.filter(
          (r) => r.factoryId === factory.id && r.month === month
        );
        if (entries.length === 0) return { month, maxLoadRate: 0, avgLoadRate: 0 };
        const maxLoadRate = Math.max(...entries.map((e) => e.maxLoadRate));
        const avgLoadRate = entries.reduce((s, e) => s + e.avgLoadRate, 0) / entries.length;
        return { month, maxLoadRate, avgLoadRate };
      });
      return { factoryId: factory.id, factoryName: factory.name, months };
    });

    // KPI
    const allAvgRates = zoneMonthResults.map((r) => r.avgLoadRate);
    const avgLoadRate =
      allAvgRates.length > 0 ? allAvgRates.reduce((s, r) => s + r, 0) / allAvgRates.length : 0;

    const riskDays = zoneMonthResults.reduce((s, r) => s + r.riskDayCount, 0);

    const peakEntry = zoneMonthResults.reduce<ZoneMonthResult | null>(
      (best, cur) => (best === null || cur.maxLoadRate > best.maxLoadRate ? cur : best),
      null
    );
    const peakZone = peakEntry
      ? {
          factoryName: peakEntry.factoryName,
          zoneName: peakEntry.zoneName,
          month: peakEntry.month,
          maxLoadRate: peakEntry.maxLoadRate,
        }
      : null;

    res.json({ kpi: { avgLoadRate, peakZone, riskDays }, heatmap });
  } catch (e) {
    next(e);
  }
});

// GET /api/dashboard/factory/:id/month?year=2025&month=6
router.get('/factory/:id/month', async (req, res, next) => {
  try {
    const factoryId = Number(req.params.id);
    const year = Number(req.query.year ?? new Date().getFullYear());
    const month = Number(req.query.month ?? new Date().getMonth() + 1);

    const factory = await prisma.factory.findUniqueOrThrow({ where: { id: factoryId } });
    const zones = await prisma.zone.findMany({
      where: { factoryId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const dim = daysInMonth(year, month);
    const start = utcDate(year, month, 1);
    const end = utcDate(year, month, dim);

    const zoneData = await Promise.all(
      zones.map(async (zone) => {
        const days = await getLoadRateByPeriod(zone.id, start, end);
        const rates = days.map((d) => d.loadRate);
        const maxLoadRate = rates.length > 0 ? Math.max(...rates) : 0;
        const avgLoadRate =
          rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
        return { zoneId: zone.id, zoneName: zone.name, availableAreaSqm: Number(zone.availableAreaSqm), maxLoadRate, avgLoadRate, days };
      })
    );

    const dailySummary = Array.from({ length: dim }, (_, i) => {
      const dateStr = utcDate(year, month, i + 1).toISOString().slice(0, 10);
      let totalRate = 0;
      let peakZone = '';
      let peakLoadRate = 0;
      let count = 0;

      for (const z of zoneData) {
        const day = z.days.find((d) => d.date === dateStr);
        if (day) {
          totalRate += day.loadRate;
          count++;
          if (day.loadRate > peakLoadRate) {
            peakLoadRate = day.loadRate;
            peakZone = z.zoneName;
          }
        }
      }

      return { date: dateStr, avgLoadRate: count > 0 ? totalRate / count : 0, peakZone, peakLoadRate };
    });

    res.json({ factoryName: factory.name, year, month, zones: zoneData, dailySummary });
  } catch (e) {
    next(e);
  }
});

export default router;
