-- AlterTable: Project — 사업부문 추가
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "businessDivision" TEXT;

-- AlterTable: AreaAssignment — 수량, 여유율 추가
ALTER TABLE "AreaAssignment" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
ALTER TABLE "AreaAssignment" ADD COLUMN IF NOT EXISTS "marginRate" DOUBLE PRECISION;

-- CreateTable: ProjectItem
CREATE TABLE IF NOT EXISTS "ProjectItem" (
    "id"           SERIAL          NOT NULL,
    "projectId"    INTEGER         NOT NULL,
    "itemName"     TEXT            NOT NULL,
    "itemCategory" TEXT,
    "widthM"       DOUBLE PRECISION NOT NULL,
    "heightM"      DOUBLE PRECISION NOT NULL,
    "quantity"     INTEGER         NOT NULL DEFAULT 1,
    "marginRate"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitAreaSqm"  DOUBLE PRECISION NOT NULL,
    "totalAreaSqm" DOUBLE PRECISION NOT NULL,
    "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AreaDemandSegment
CREATE TABLE IF NOT EXISTS "AreaDemandSegment" (
    "id"                SERIAL          NOT NULL,
    "assignmentId"      INTEGER         NOT NULL,
    "phaseNo"           INTEGER         NOT NULL,
    "startDate"         TIMESTAMP(3)    NOT NULL,
    "endDate"           TIMESTAMP(3)    NOT NULL,
    "widthM"            DOUBLE PRECISION NOT NULL,
    "heightM"           DOUBLE PRECISION NOT NULL,
    "quantity"          INTEGER         NOT NULL DEFAULT 1,
    "marginRate"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculatedAreaSqm" DOUBLE PRECISION NOT NULL,
    "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AreaDemandSegment_pkey" PRIMARY KEY ("id")
);
