-- CreateEnum
CREATE TYPE "AccountAutomationMode" AS ENUM ('FULL', 'POSTING_ONLY');

-- AlterTable
-- Default FULL preserves current behavior for every existing account (all of
-- which use the hosted browser today) — only newly created posting-only
-- accounts opt into the lighter mode.
ALTER TABLE "Account" ADD COLUMN "automationMode" "AccountAutomationMode" NOT NULL DEFAULT 'FULL';
