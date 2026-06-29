-- Backfill: create a default draft and stamp draftId on any rows that don't have one yet.
-- This runs between the expand migration (nullable draftId added) and the contract migration
-- (SET NOT NULL). On databases where the backfill script was already run manually, this is
-- a no-op. On fresh deploys with pre-existing data, this ensures the data is ready for
-- the contract migration.
DO $$
DECLARE
  v_draft_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "Team" WHERE "draftId" IS NULL LIMIT 1) THEN
    INSERT INTO "Draft" ("name") VALUES ('Draft 2025') RETURNING id INTO v_draft_id;
    UPDATE "Team" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "AuctionResult" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "PlayerWatchlist" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "NominatedPlayer" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
  END IF;
END $$;
