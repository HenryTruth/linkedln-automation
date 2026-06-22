-- Add connection note template directly on the Campaign model
-- so CONNECT campaigns can define personalised outreach notes with dynamic variables.
ALTER TABLE "Campaign" ADD COLUMN "connectionNoteTemplate" TEXT;
