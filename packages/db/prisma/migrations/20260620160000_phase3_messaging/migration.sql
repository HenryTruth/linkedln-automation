-- Phase 3: Messaging sequence engine
-- Adds delayDays to Message, variantGroup + repliedAt to CampaignLead

ALTER TABLE "Message" ADD COLUMN "delayDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "CampaignLead" ADD COLUMN "variantGroup" TEXT NOT NULL DEFAULT 'A';
ALTER TABLE "CampaignLead" ADD COLUMN "repliedAt" TIMESTAMP(3);

CREATE INDEX "CampaignLead_repliedAt_idx" ON "CampaignLead"("repliedAt");
