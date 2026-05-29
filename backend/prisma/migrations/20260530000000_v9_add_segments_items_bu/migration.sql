-- AlterTable: Project — 사업부문 추가
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "businessDivision" TEXT;

-- AlterTable: AreaAssignment — 수량, 여유율 추가
ALTER TABLE "AreaAssignment" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
ALTER TABLE "AreaAssignment" ADD COLUMN IF NOT EXISTS "marginRate" DOUBLE PRECISION;

-- CreateTable: ProjectItem — 아이템별 면적 관리
CREATE TABLE IF NOT EXISTS "ProjectItem" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCategory" TEXT,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "marginRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitAreaSqm" DOUBLE PRECISION NOT NULL,
    "totalAreaSqm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AreaDemandSegment — 2구간 조립 공간
CREATE TABLE IF NOT EXISTS "AreaDemandSegment" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "phaseNo" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "marginRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculatedAreaSqm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AreaDemandSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: ProjectItem → Project
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectItem_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectItem" ADD CONSTRAINT "ProjectItem_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: AreaDemandSegment → AreaAssignment
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AreaDemandSegment_assignmentId_fkey'
  ) THEN
    ALTER TABLE "AreaDemandSegment" ADD CONSTRAINT "AreaDemandSegment_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "AreaAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
