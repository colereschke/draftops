-- Backfill: create a default draft and stamp draftId on any rows that don't have one yet.
-- This runs between the expand migration (nullable draftId added) and the contract migration
-- (SET NOT NULL). On databases where the backfill script was already run manually, this is
-- a no-op. On fresh deploys with pre-existing data, this ensures the data is ready for
-- the contract migration.
--
-- The guard checks all four tables (not just Team) so a partial manual backfill that
-- stamped Team rows but left AuctionResult/Watchlist/Nominated rows NULL still triggers.
-- Inside the block, we reuse any existing 'Draft 2025' rather than creating a duplicate.
DO $$
DECLARE
  v_draft_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "Team" WHERE "draftId" IS NULL LIMIT 1)
     OR EXISTS (SELECT 1 FROM "AuctionResult" WHERE "draftId" IS NULL LIMIT 1)
     OR EXISTS (SELECT 1 FROM "PlayerWatchlist" WHERE "draftId" IS NULL LIMIT 1)
     OR EXISTS (SELECT 1 FROM "NominatedPlayer" WHERE "draftId" IS NULL LIMIT 1)
  THEN
    SELECT id INTO v_draft_id FROM "Draft" WHERE "name" = 'Draft 2025' LIMIT 1;
    IF v_draft_id IS NULL THEN
      INSERT INTO "Draft" ("name") VALUES ('Draft 2025') RETURNING id INTO v_draft_id;
    END IF;
    UPDATE "Team" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "AuctionResult" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "PlayerWatchlist" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
    UPDATE "NominatedPlayer" SET "draftId" = v_draft_id WHERE "draftId" IS NULL;
  END IF;
END $$;
