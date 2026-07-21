-- Retain the first persisted match for every ranking-set/Sleeper-player pair. Later rows need
-- manual resolution, while unmatched rows (whose Sleeper IDs are already NULL) are untouched.
WITH duplicate_matches AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY "rankingSetId", "sleeperId" ORDER BY id) AS match_order
  FROM "UserRankingPlayer"
  WHERE "sleeperId" IS NOT NULL
)
UPDATE "UserRankingPlayer" AS ranking_player
SET
  "sleeperId" = NULL,
  "matchStatus" = 'unmatched'
FROM duplicate_matches
WHERE ranking_player.id = duplicate_matches.id
  AND duplicate_matches.match_order > 1;

-- CreateIndex
CREATE UNIQUE INDEX "UserRankingPlayer_rankingSetId_sleeperId_key"
ON "UserRankingPlayer"("rankingSetId", "sleeperId");
