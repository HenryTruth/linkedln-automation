-- Add session-sticky proxy profile support.
CREATE TYPE "ProxyRotationMode" AS ENUM ('STATIC', 'STICKY_SESSION');

ALTER TABLE "Proxy"
  ADD COLUMN "usernameTemplate" TEXT,
  ADD COLUMN "rotationMode" "ProxyRotationMode" NOT NULL DEFAULT 'STATIC',
  ADD COLUMN "currentSessionId" TEXT,
  ADD COLUMN "currentExitIp" TEXT,
  ADD COLUMN "lastSessionStartedAt" TIMESTAMP(3);
