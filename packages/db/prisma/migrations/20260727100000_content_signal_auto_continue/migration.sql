ALTER TABLE "ContentSignalConfig"
  ADD COLUMN "autoContinueUntilTarget" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoContinueDelayMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "autoContinueEmptyRunsLimit" INTEGER NOT NULL DEFAULT 3;
