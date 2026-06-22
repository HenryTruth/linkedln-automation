-- Add user ownership to core tenant data and job state to campaign leads.

CREATE TYPE "CampaignLeadJobStatus" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'SENT', 'SKIPPED', 'FAILED');

INSERT INTO "User" ("id", "email", "passwordHash", "plan", "createdAt", "updatedAt")
SELECT 'legacy-owner', 'legacy@example.local', 'legacy-migrated-password-disabled', 'FREE_FOREVER', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "User");

ALTER TABLE "Account" ADD COLUMN "userId" TEXT;
ALTER TABLE "Proxy" ADD COLUMN "userId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "userId" TEXT;

UPDATE "Account"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "Proxy"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "Lead"
SET "userId" = COALESCE(
  (SELECT "userId" FROM "Account" WHERE "Account"."id" = "Lead"."accountId"),
  (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE "userId" IS NULL;

ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Proxy" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "CampaignLead"
  ADD COLUMN "jobStatus" "CampaignLeadJobStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "queuedJobId" TEXT,
  ADD COLUMN "lastJobError" TEXT;

DROP INDEX IF EXISTS "Account_email_key";
DROP INDEX IF EXISTS "Lead_linkedinUrl_key";

CREATE UNIQUE INDEX "Account_userId_email_key" ON "Account"("userId", "email");
CREATE UNIQUE INDEX "Lead_userId_linkedinUrl_key" ON "Lead"("userId", "linkedinUrl");

CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Proxy_userId_idx" ON "Proxy"("userId");
CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");
CREATE INDEX "CampaignLead_jobStatus_idx" ON "CampaignLead"("jobStatus");

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Proxy"
  ADD CONSTRAINT "Proxy_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
