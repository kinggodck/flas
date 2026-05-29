-- CreateTable
CREATE TABLE "Factory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalAreaSqm" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "factoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "availableAreaSqm" REAL NOT NULL,
    "usageType" TEXT,
    "dimensions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Zone_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AreaChangeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "factoryId" INTEGER,
    "zoneId" INTEGER,
    CONSTRAINT "AreaChangeLog_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AreaChangeLog_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectNo" TEXT NOT NULL,
    "clientName" TEXT,
    "description" TEXT,
    "businessDivision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCategory" TEXT,
    "widthM" REAL NOT NULL,
    "heightM" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "marginRate" REAL NOT NULL DEFAULT 0,
    "unitAreaSqm" REAL NOT NULL,
    "totalAreaSqm" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AreaAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "requiredAreaSqm" REAL NOT NULL,
    "widthM" REAL,
    "heightM" REAL,
    "quantity" INTEGER,
    "marginRate" REAL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AreaAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AreaAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AreaDemandSegment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assignmentId" INTEGER NOT NULL,
    "phaseNo" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "widthM" REAL NOT NULL,
    "heightM" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "marginRate" REAL NOT NULL DEFAULT 0,
    "calculatedAreaSqm" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AreaDemandSegment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AreaAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Factory_code_key" ON "Factory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_factoryId_name_key" ON "Zone"("factoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNo_key" ON "Project"("projectNo");
