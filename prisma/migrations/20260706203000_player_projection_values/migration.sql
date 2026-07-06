ALTER TABLE "Player" ADD COLUMN "sleeperId" TEXT;
ALTER TABLE "Player" ADD COLUMN "projectedPoints" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "replacementPoints" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "vor" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "projectionAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "fallbackAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "activeAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "valueSource" TEXT NOT NULL DEFAULT 'fallback';
ALTER TABLE "Player" ADD COLUMN "projectionSource" TEXT;
ALTER TABLE "Player" ADD COLUMN "projectionDate" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "projectionSeason" INTEGER;

UPDATE "Player" SET "fallbackAuctionValue" = "budget", "activeAuctionValue" = "budget";

ALTER TABLE "Player" ALTER COLUMN "fallbackAuctionValue" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "activeAuctionValue" SET NOT NULL;

CREATE INDEX "Player_sleeperId_idx" ON "Player"("sleeperId");
