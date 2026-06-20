-- Add connectionNoteTemplate to ContentSignalConfig
-- Stores the per-campaign connection note template for content signal auto-connect.
-- Optional: if NULL, auto-connect queuing is skipped.
ALTER TABLE "ContentSignalConfig" ADD COLUMN "connectionNoteTemplate" TEXT;
