CREATE TABLE "AiGeneratedAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "prompt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiGeneratedAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiGeneratedAsset_userId_idx" ON "AiGeneratedAsset"("userId");
CREATE INDEX "AiGeneratedAsset_kind_idx" ON "AiGeneratedAsset"("kind");

ALTER TABLE "AiGeneratedAsset"
  ADD CONSTRAINT "AiGeneratedAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
