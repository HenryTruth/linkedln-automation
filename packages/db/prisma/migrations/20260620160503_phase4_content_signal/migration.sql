-- AlterEnum
ALTER TYPE "CampaignType" ADD VALUE 'CONTENT_SIGNAL';

-- AlterTable
ALTER TABLE "CampaignLead" ADD COLUMN     "postSignalId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "blacklistReason" TEXT,
ADD COLUMN     "blacklisted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContentSignalConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "dateRangeDays" INTEGER NOT NULL DEFAULT 7,
    "maxLeads" INTEGER NOT NULL DEFAULT 50,
    "titleFilter" TEXT,
    "companyFilter" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSignalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSignal" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentSignalConfig_campaignId_key" ON "ContentSignalConfig"("campaignId");

-- CreateIndex
CREATE INDEX "ContentSignalConfig_keyword_idx" ON "ContentSignalConfig"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "PostSignal_postUrl_key" ON "PostSignal"("postUrl");

-- CreateIndex
CREATE INDEX "PostSignal_leadId_idx" ON "PostSignal"("leadId");

-- CreateIndex
CREATE INDEX "PostSignal_campaignId_idx" ON "PostSignal"("campaignId");

-- CreateIndex
CREATE INDEX "PostSignal_keyword_idx" ON "PostSignal"("keyword");

-- CreateIndex
CREATE INDEX "Lead_blacklisted_idx" ON "Lead"("blacklisted");

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_postSignalId_fkey" FOREIGN KEY ("postSignalId") REFERENCES "PostSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSignalConfig" ADD CONSTRAINT "ContentSignalConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSignal" ADD CONSTRAINT "PostSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
