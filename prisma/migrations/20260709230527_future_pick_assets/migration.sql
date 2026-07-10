-- CreateEnum
CREATE TYPE "FuturePickAuctionMode" AS ENUM ('PACKAGES', 'INDIVIDUAL', 'NONE');

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "futurePickAuctionMode" "FuturePickAuctionMode" NOT NULL DEFAULT 'PACKAGES';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "futurePickAssetKind" TEXT,
ADD COLUMN     "futurePickOriginHandle" TEXT,
ADD COLUMN     "futurePickRound" INTEGER,
ADD COLUMN     "futurePickYear" INTEGER;

-- CreateIndex
CREATE INDEX "Player_draftId_futurePickOriginHandle_idx" ON "Player"("draftId", "futurePickOriginHandle");
