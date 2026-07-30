ALTER TABLE "Account"
  ADD COLUMN "linkedinAccessTokenEncrypted" TEXT,
  ADD COLUMN "linkedinAccessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "linkedinMemberUrn" TEXT,
  ADD COLUMN "linkedinConnectedAt" TIMESTAMP(3);

