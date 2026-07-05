CREATE TYPE "LeadSource" AS ENUM (
  'MANUAL',
  'CSV',
  'LINKEDIN_SEARCH',
  'SALES_NAVIGATOR',
  'CONTENT_SIGNAL'
);

ALTER TABLE "Account"
  ADD COLUMN "monthlyCaps" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "salesNavigatorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inMailMonthlyLimit" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "Lead"
  ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "Message"
  ADD COLUMN "subjectTemplate" TEXT;

CREATE INDEX "Lead_source_idx" ON "Lead"("source");
