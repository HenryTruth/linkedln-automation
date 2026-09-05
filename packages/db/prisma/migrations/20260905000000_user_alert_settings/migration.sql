-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSetting_userId_idx" ON "UserSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: the pre-existing global SystemSetting rows for
-- alert_webhook_url / alert_email_to were served to and editable by every
-- user (this table had no userId column at all). That value is the admin's
-- own real alert destination (set via the Settings UI), so move it onto the
-- admin's account rather than discarding it — every other user starts with
-- an empty alert config, as they always should have.
INSERT INTO "UserSetting" ("id", "userId", "key", "value", "updatedAt")
SELECT
  'usrset_' || substr(md5(random()::text || s."key"), 1, 20),
  u."id",
  s."key",
  s."value",
  s."updatedAt"
FROM "SystemSetting" s
JOIN "User" u ON u."email" = 'henrysempire111@gmail.com'
WHERE s."key" IN ('alert_webhook_url', 'alert_email_to');

DELETE FROM "SystemSetting" WHERE "key" IN ('alert_webhook_url', 'alert_email_to');
