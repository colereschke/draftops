ALTER TABLE "Player" ADD COLUMN "customKey" TEXT;
ALTER TABLE "AuctionResult" ADD COLUMN "playerId" INTEGER;
ALTER TABLE "PlayerWatchlist" ADD COLUMN "playerId" INTEGER;
ALTER TABLE "NominatedPlayer" ADD COLUMN "playerId" INTEGER;

DROP INDEX "Player_name_draftId_key";
CREATE INDEX "Player_name_draftId_idx" ON "Player"("name", "draftId");

WITH package_slots AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY "draftId" ORDER BY "sfRank", id) AS slot
  FROM "Player"
  WHERE "futurePickAssetKind" = 'package'
    AND "futurePickYear" = 2027
)
UPDATE "Player" p
SET "customKey" = 'pkg:2027:slot:' || lpad(package_slots.slot::text, 2, '0')
FROM package_slots
WHERE p.id = package_slots.id
  AND p."customKey" IS NULL;

UPDATE "Player"
SET "customKey" = 'pkg:2028:bundle'
WHERE "futurePickAssetKind" = 'package'
  AND "futurePickYear" = 2028
  AND "customKey" IS NULL;

UPDATE "Player"
SET "customKey" = 'pick:2028:round:' || "futurePickRound"::text
WHERE "futurePickAssetKind" = 'pick'
  AND "futurePickYear" = 2028
  AND "futurePickRound" IS NOT NULL
  AND "customKey" IS NULL;

UPDATE "AuctionResult" ar
SET "playerId" = p.id
FROM "Player" p
WHERE ar."draftId" = p."draftId"
  AND ar.player = p.name
  AND ar."playerId" IS NULL;

UPDATE "PlayerWatchlist" wl
SET "playerId" = p.id
FROM "Player" p
WHERE wl."draftId" = p."draftId"
  AND wl."playerName" = p.name
  AND wl."playerId" IS NULL;

UPDATE "NominatedPlayer" np
SET "playerId" = p.id
FROM "Player" p
WHERE np."draftId" = p."draftId"
  AND np."playerName" = p.name
  AND np."playerId" IS NULL;

ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlayerWatchlist"
  ADD CONSTRAINT "PlayerWatchlist_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NominatedPlayer"
  ADD CONSTRAINT "NominatedPlayer_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Player_sleeperId_draftId_key" ON "Player"("sleeperId", "draftId");
CREATE UNIQUE INDEX "Player_customKey_draftId_key" ON "Player"("customKey", "draftId");
CREATE INDEX "AuctionResult_playerId_idx" ON "AuctionResult"("playerId");
CREATE UNIQUE INDEX "PlayerWatchlist_playerId_draftId_key"
  ON "PlayerWatchlist"("playerId", "draftId");
CREATE INDEX "PlayerWatchlist_playerId_idx" ON "PlayerWatchlist"("playerId");
CREATE UNIQUE INDEX "NominatedPlayer_playerId_draftId_key"
  ON "NominatedPlayer"("playerId", "draftId");
CREATE INDEX "NominatedPlayer_playerId_idx" ON "NominatedPlayer"("playerId");
