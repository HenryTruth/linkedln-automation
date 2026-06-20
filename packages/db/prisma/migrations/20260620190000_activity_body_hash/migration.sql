-- Add bodyHash to ActivityLog for same-message-body deduplication (Guard 9)
ALTER TABLE "ActivityLog" ADD COLUMN "bodyHash" TEXT;

CREATE INDEX "ActivityLog_accountId_bodyHash_idx" ON "ActivityLog"("accountId", "bodyHash");
