-- Drop orphaned projection-value columns left on "Player" after the projection
-- values were relocated to the "DraftPlayerValue" table (see 20260708120000_repair_projection_value_tables).
-- These columns were never dropped from "Player" when the model was cleaned up, causing
-- drift: "fallbackAuctionValue"/"activeAuctionValue" are NOT NULL with no default, so every
-- new Player insert (which no longer supplies them) failed with a null constraint violation.
--
-- IF EXISTS keeps this idempotent: it drops the columns on the drifted database, and is a
-- safe no-op on a fresh database built purely from migrations (where they were never created).
ALTER TABLE "Player" DROP COLUMN IF EXISTS "projectedPoints";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "replacementPoints";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "vor";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "projectionAuctionValue";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "fallbackAuctionValue";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "activeAuctionValue";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "valueSource";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "projectionSource";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "projectionDate";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "projectionSeason";
