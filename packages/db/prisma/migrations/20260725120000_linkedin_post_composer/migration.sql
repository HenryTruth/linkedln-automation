CREATE TYPE "LinkedInPostStatus" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "PostMediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'ARTICLE');

CREATE TABLE "LinkedInPost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "prompt" TEXT,
  "tone" TEXT,
  "audience" TEXT,
  "callToAction" TEXT,
  "status" "LinkedInPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledFor" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "linkedinPostUrn" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LinkedInPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "type" "PostMediaType" NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LinkedInPost_userId_status_idx" ON "LinkedInPost"("userId", "status");
CREATE INDEX "LinkedInPost_accountId_scheduledFor_idx" ON "LinkedInPost"("accountId", "scheduledFor");
CREATE INDEX "LinkedInPost_scheduledFor_idx" ON "LinkedInPost"("scheduledFor");
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

ALTER TABLE "LinkedInPost" ADD CONSTRAINT "LinkedInPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LinkedInPost" ADD CONSTRAINT "LinkedInPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LinkedInPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
