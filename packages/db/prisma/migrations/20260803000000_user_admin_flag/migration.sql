-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Seed the configured local admin account.
UPDATE "User"
SET "isAdmin" = true
WHERE "email" = 'henrysempire111@gmail.com';
