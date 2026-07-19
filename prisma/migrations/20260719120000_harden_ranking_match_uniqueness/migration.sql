-- CreateIndex
CREATE UNIQUE INDEX "UserRankingPlayer_rankingSetId_sleeperId_key"
ON "UserRankingPlayer"("rankingSetId", "sleeperId");
