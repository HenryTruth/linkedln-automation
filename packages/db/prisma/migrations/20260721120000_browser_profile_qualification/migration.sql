ALTER TABLE "Account"
  ADD COLUMN "browserProfileStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "browserProfileLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "browserProfileLastCheckError" TEXT,
  ADD COLUMN "lastSearchQualifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastSearchQualifiedUrl" TEXT,
  ADD COLUMN "lastSearchQualifiedSource" TEXT,
  ADD COLUMN "lastSearchQualifiedProfileLinks" INTEGER,
  ADD COLUMN "lastSearchQualifiedNextButtons" INTEGER,
  ADD COLUMN "lastSearchQualificationError" TEXT;

CREATE INDEX "Account_browserProfileStatus_idx" ON "Account"("browserProfileStatus");
CREATE INDEX "Account_lastSearchQualifiedAt_idx" ON "Account"("lastSearchQualifiedAt");
