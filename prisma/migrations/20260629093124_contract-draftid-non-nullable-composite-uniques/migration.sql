-- DropForeignKey
ALTER TABLE "AuctionResult" DROP CONSTRAINT "AuctionResult_draftId_fkey";

-- DropForeignKey
ALTER TABLE "NominatedPlayer" DROP CONSTRAINT "NominatedPlayer_draftId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerWatchlist" DROP CONSTRAINT "PlayerWatchlist_draftId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_draftId_fkey";

-- DropIndex
DROP INDEX "NominatedPlayer_playerName_key";

-- DropIndex
DROP INDEX "PlayerWatchlist_playerName_key";

-- DropIndex
DROP INDEX "Team_handle_key";

-- AlterTable
ALTER TABLE "AuctionResult" ALTER COLUMN "draftId" SET NOT NULL;

-- AlterTable
ALTER TABLE "NominatedPlayer" ALTER COLUMN "draftId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PlayerWatchlist" ALTER COLUMN "draftId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "draftId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NominatedPlayer_playerName_draftId_key" ON "NominatedPlayer"("playerName", "draftId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWatchlist_playerName_draftId_key" ON "PlayerWatchlist"("playerName", "draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_handle_draftId_key" ON "Team"("handle", "draftId");

-- AddForeignKey
ALTER TABLE "AuctionResult" ADD CONSTRAINT "AuctionResult_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NominatedPlayer" ADD CONSTRAINT "NominatedPlayer_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWatchlist" ADD CONSTRAINT "PlayerWatchlist_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
