import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const factories = [
  {
    code: '이진',
    name: '이진공장',
    totalAreaSqm: 66619,
    zones: [
      { name: 'A-1', availableAreaSqm: 2610, dimensions: '25x160', usageType: '조립' },
      { name: 'A-2', availableAreaSqm: 2790, dimensions: '25x160', usageType: '조립' },
      { name: 'B-1', availableAreaSqm: 3792, dimensions: '25x160', usageType: '조립' },
      { name: 'B-2', availableAreaSqm: 3952, dimensions: '25x160', usageType: '조립' },
      { name: 'B-3', availableAreaSqm: 4784, dimensions: '25x160', usageType: '조립' },
      { name: 'B-4', availableAreaSqm: 5072, dimensions: '25x160', usageType: '조립' },
      { name: '도장샵', availableAreaSqm: 1070, usageType: '도장' },
      { name: 'RT ROOM-1', availableAreaSqm: 300, usageType: '검사' },
      { name: 'RT ROOM-2', availableAreaSqm: 149, usageType: '검사' },
      { name: 'YARD-1', availableAreaSqm: 10339, usageType: '야적' },
      { name: 'YARD-2', availableAreaSqm: 2350, usageType: '야적' },
      { name: 'YARD-3', availableAreaSqm: 3600, usageType: '야적' },
      { name: 'YARD-4', availableAreaSqm: 1214, usageType: '야적' },
      { name: 'YARD-5', availableAreaSqm: 3200, usageType: '야적' },
    ],
  },
  {
    code: '처용',
    name: '처용공장',
    totalAreaSqm: 22328,
    zones: [
      { name: 'shop A', availableAreaSqm: 2701, dimensions: '25x105', usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 2686, dimensions: '25x105', usageType: '조립' },
      { name: 'shop C', availableAreaSqm: 2581, dimensions: '25x105', usageType: '조립' },
      { name: 'shop D', availableAreaSqm: 2747, dimensions: '25x105', usageType: '조립' },
      { name: 'YARD-1', availableAreaSqm: 2100, usageType: '야적' },
      { name: 'YARD-2', availableAreaSqm: 1725, usageType: '야적' },
      { name: 'RT ROOM', availableAreaSqm: 237, usageType: '검사' },
      { name: '자재창고1', availableAreaSqm: 323, usageType: '창고' },
      { name: '자재창고2', availableAreaSqm: 562, usageType: '창고' },
      { name: '위험물저장소', availableAreaSqm: 21, usageType: '창고' },
      { name: '기계실', availableAreaSqm: 75, usageType: '기타' },
    ],
  },
  {
    code: '경주',
    name: '경주공장',
    totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 1000, dimensions: '20x60', usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 900, dimensions: '20x50', usageType: '조립' },
      { name: 'shop C', availableAreaSqm: 585, dimensions: '18x50', usageType: '조립' },
      { name: 'shop D', availableAreaSqm: 810, dimensions: '18x50', usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 2927, usageType: '야적' },
    ],
  },
  {
    code: '고성',
    name: '고성공장',
    totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 1817, usageType: '조립' },
      { name: 'shop B', availableAreaSqm: 1975, usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 10145, usageType: '야적' },
    ],
  },
  {
    code: '거제',
    name: '거제공장(임대)',
    totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 2250, usageType: '조립' },
      { name: 'YARD', availableAreaSqm: 16880, usageType: '야적' },
    ],
  },
  {
    code: '기계',
    name: '기계공장',
    totalAreaSqm: null,
    zones: [
      { name: 'shop A', availableAreaSqm: 2304, usageType: '조립' },
    ],
  },
];

async function main() {
  console.log('Seeding factory master data...');

  for (const f of factories) {
    const factory = await prisma.factory.upsert({
      where: { code: f.code },
      update: { name: f.name, totalAreaSqm: f.totalAreaSqm },
      create: { code: f.code, name: f.name, totalAreaSqm: f.totalAreaSqm },
    });

    for (const z of f.zones) {
      await prisma.zone.upsert({
        where: { factoryId_name: { factoryId: factory.id, name: z.name } },
        update: { availableAreaSqm: z.availableAreaSqm, usageType: z.usageType ?? null, dimensions: z.dimensions ?? null },
        create: {
          factoryId: factory.id,
          name: z.name,
          availableAreaSqm: z.availableAreaSqm,
          usageType: z.usageType ?? null,
          dimensions: z.dimensions ?? null,
        },
      });
    }
    console.log(`  ✓ ${f.name} (${f.zones.length}개 구역)`);
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
