-- Add base value columns (nullable first so existing rows can be backfilled)
ALTER TABLE "Player" ADD COLUMN "baseBudget" INTEGER;
ALTER TABLE "Player" ADD COLUMN "baseCeiling" INTEGER;
ALTER TABLE "Player" ADD COLUMN "baseFloor" INTEGER;

-- Existing drafts are left untouched: base == current adjusted value
UPDATE "Player" SET "baseBudget" = "budget", "baseCeiling" = "ceiling", "baseFloor" = "floor";

-- Lock them down to match the schema (NOT NULL)
ALTER TABLE "Player" ALTER COLUMN "baseBudget" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "baseCeiling" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "baseFloor" SET NOT NULL;
