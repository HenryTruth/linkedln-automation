-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('SCRAPE_SEARCH', 'VISIT_PROFILE', 'LIKE_POST', 'WAIT', 'SEND_CONNECTION_REQUEST', 'SEND_MESSAGE', 'SEND_INMAIL', 'WITHDRAW_CONNECTION');

-- CreateEnum
CREATE TYPE "EdgeCondition" AS ENUM ('DEFAULT', 'CONNECTION_ACCEPTED', 'CONNECTION_TIMEOUT');

-- AlterEnum
ALTER TYPE "CampaignType" ADD VALUE 'SEQUENCE';

-- AlterTable
ALTER TABLE "CampaignLead" ADD COLUMN     "branchAwaitingSince" TIMESTAMP(3),
ADD COLUMN     "currentStepId" TEXT,
ADD COLUMN     "stepEnteredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "StepType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEdge" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fromStepId" TEXT NOT NULL,
    "toStepId" TEXT NOT NULL,
    "condition" "EdgeCondition" NOT NULL DEFAULT 'DEFAULT',

    CONSTRAINT "SequenceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SequenceStep_campaignId_idx" ON "SequenceStep"("campaignId");

-- CreateIndex
CREATE INDEX "SequenceEdge_campaignId_idx" ON "SequenceEdge"("campaignId");

-- CreateIndex
CREATE INDEX "SequenceEdge_toStepId_idx" ON "SequenceEdge"("toStepId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEdge_fromStepId_condition_key" ON "SequenceEdge"("fromStepId", "condition");

-- CreateIndex
CREATE INDEX "CampaignLead_currentStepId_idx" ON "CampaignLead"("currentStepId");

-- AddForeignKey
ALTER TABLE "CampaignLead" ADD CONSTRAINT "CampaignLead_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "SequenceStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEdge" ADD CONSTRAINT "SequenceEdge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEdge" ADD CONSTRAINT "SequenceEdge_fromStepId_fkey" FOREIGN KEY ("fromStepId") REFERENCES "SequenceStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEdge" ADD CONSTRAINT "SequenceEdge_toStepId_fkey" FOREIGN KEY ("toStepId") REFERENCES "SequenceStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
