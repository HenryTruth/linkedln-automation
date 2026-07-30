ALTER TABLE "Lead"
  ADD COLUMN "aiFitScore" INTEGER,
  ADD COLUMN "aiFit" TEXT,
  ADD COLUMN "aiSummary" TEXT,
  ADD COLUMN "aiRecommendedAngle" TEXT,
  ADD COLUMN "aiRiskFlags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "aiSuggestedMessage" TEXT,
  ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3);

CREATE INDEX "Lead_aiFitScore_idx" ON "Lead"("aiFitScore");
CREATE INDEX "Lead_aiAnalyzedAt_idx" ON "Lead"("aiAnalyzedAt");
