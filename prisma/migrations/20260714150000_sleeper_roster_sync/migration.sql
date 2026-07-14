ALTER TABLE "Draft" ADD COLUMN "sleeperLeagueId" TEXT;
ALTER TABLE "Team" ADD COLUMN "sleeperRosterId" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuctionResult"
    WHERE "playerId" IS NOT NULL
    GROUP BY "draftId", "playerId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add AuctionResult(draftId, playerId) uniqueness: duplicate player results exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Team_draftId_sleeperRosterId_key" ON "Team"("draftId", "sleeperRosterId");
CREATE UNIQUE INDEX "AuctionResult_draftId_playerId_key" ON "AuctionResult"("draftId", "playerId");
