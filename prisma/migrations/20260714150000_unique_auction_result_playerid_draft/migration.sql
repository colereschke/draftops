-- CreateIndex
DROP INDEX "AuctionResult_playerId_idx";
CREATE UNIQUE INDEX "AuctionResult_playerId_draftId_key" ON "AuctionResult"("playerId", "draftId");
