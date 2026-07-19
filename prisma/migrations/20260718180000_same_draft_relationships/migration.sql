BEGIN;

-- Freeze draft-scoped relationship writes while the preflight and backfill run.
LOCK TABLE
  "Draft",
  "Team",
  "AuctionResult",
  "PlayerWatchlist",
  "NominatedPlayer",
  "Player",
  "DraftPlayerValue"
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  violation_count bigint;
BEGIN
  SELECT count(*) INTO violation_count
  FROM "Draft" d
  LEFT JOIN "Team" t ON t.id = d."ownerTeamId"
  WHERE d."ownerTeamId" IS NOT NULL AND t.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Draft.ownerTeamId references a missing team (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "Draft" d
  JOIN "Team" t ON t.id = d."ownerTeamId"
  WHERE t."draftId" <> d.id;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Draft.ownerTeamId references a team from another draft (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "AuctionResult" ar
  LEFT JOIN "Team" t ON t.id = ar."teamId"
  WHERE t.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.teamId references a missing team (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "AuctionResult" ar
  JOIN "Team" t ON t.id = ar."teamId"
  WHERE t."draftId" <> ar."draftId";
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.teamId references a team from another draft (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "AuctionResult" ar
  LEFT JOIN "Player" p ON p.id = ar."playerId"
  WHERE ar."playerId" IS NOT NULL AND p.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.playerId references a missing player (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "AuctionResult" ar
  JOIN "Player" p ON p.id = ar."playerId"
  WHERE p."draftId" <> ar."draftId";
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.playerId references a player from another draft (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "PlayerWatchlist" pw
  LEFT JOIN "Player" p ON p.id = pw."playerId"
  WHERE pw."playerId" IS NOT NULL AND p.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'PlayerWatchlist.playerId references a missing player (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "PlayerWatchlist" pw
  JOIN "Player" p ON p.id = pw."playerId"
  WHERE p."draftId" <> pw."draftId";
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'PlayerWatchlist.playerId references a player from another draft (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "NominatedPlayer" np
  LEFT JOIN "Player" p ON p.id = np."playerId"
  WHERE np."playerId" IS NOT NULL AND p.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'NominatedPlayer.playerId references a missing player (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "NominatedPlayer" np
  JOIN "Player" p ON p.id = np."playerId"
  WHERE p."draftId" <> np."draftId";
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'NominatedPlayer.playerId references a player from another draft (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "DraftPlayerValue" dpv
  LEFT JOIN "Player" p ON p.id = dpv."playerId"
  WHERE p.id IS NULL;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'DraftPlayerValue.playerId references a missing player (% row(s))', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM "DraftPlayerValue" dpv
  JOIN "Player" p ON p.id = dpv."playerId"
  WHERE p."draftId" <> dpv."draftId";
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'DraftPlayerValue.playerId references a player from another draft (% row(s))', violation_count;
  END IF;
END $$;

DO $$
DECLARE
  violation_count bigint;
BEGIN
  WITH candidates AS (
    SELECT ar.id, count(p.id) AS candidate_count
    FROM "AuctionResult" ar
    LEFT JOIN "Player" p
      ON p."draftId" = ar."draftId" AND p.name = ar.player
    WHERE ar."playerId" IS NULL
    GROUP BY ar.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count = 0;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.playerId null reference has no same-draft player match (% row(s))', violation_count;
  END IF;

  WITH candidates AS (
    SELECT ar.id, count(p.id) AS candidate_count
    FROM "AuctionResult" ar
    LEFT JOIN "Player" p
      ON p."draftId" = ar."draftId" AND p.name = ar.player
    WHERE ar."playerId" IS NULL
    GROUP BY ar.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count > 1;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.playerId null reference is ambiguous within its draft (% row(s))', violation_count;
  END IF;

  WITH candidates AS (
    SELECT pw.id, count(p.id) AS candidate_count
    FROM "PlayerWatchlist" pw
    LEFT JOIN "Player" p
      ON p."draftId" = pw."draftId" AND p.name = pw."playerName"
    WHERE pw."playerId" IS NULL
    GROUP BY pw.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count = 0;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'PlayerWatchlist.playerId null reference has no same-draft player match (% row(s))', violation_count;
  END IF;

  WITH candidates AS (
    SELECT pw.id, count(p.id) AS candidate_count
    FROM "PlayerWatchlist" pw
    LEFT JOIN "Player" p
      ON p."draftId" = pw."draftId" AND p.name = pw."playerName"
    WHERE pw."playerId" IS NULL
    GROUP BY pw.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count > 1;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'PlayerWatchlist.playerId null reference is ambiguous within its draft (% row(s))', violation_count;
  END IF;

  WITH candidates AS (
    SELECT np.id, count(p.id) AS candidate_count
    FROM "NominatedPlayer" np
    LEFT JOIN "Player" p
      ON p."draftId" = np."draftId" AND p.name = np."playerName"
    WHERE np."playerId" IS NULL
    GROUP BY np.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count = 0;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'NominatedPlayer.playerId null reference has no same-draft player match (% row(s))', violation_count;
  END IF;

  WITH candidates AS (
    SELECT np.id, count(p.id) AS candidate_count
    FROM "NominatedPlayer" np
    LEFT JOIN "Player" p
      ON p."draftId" = np."draftId" AND p.name = np."playerName"
    WHERE np."playerId" IS NULL
    GROUP BY np.id
  )
  SELECT count(*) INTO violation_count FROM candidates WHERE candidate_count > 1;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'NominatedPlayer.playerId null reference is ambiguous within its draft (% row(s))', violation_count;
  END IF;
END $$;

DO $$
DECLARE
  violation_count bigint;
BEGIN
  WITH resolved AS (
    SELECT
      ar.id,
      ar."draftId",
      COALESCE(
        ar."playerId",
        (
          SELECT min(p.id)
          FROM "Player" p
          WHERE p."draftId" = ar."draftId" AND p.name = ar.player
          HAVING count(p.id) = 1
        )
      ) AS resolved_player_id
    FROM "AuctionResult" ar
  ), duplicates AS (
    SELECT "draftId", resolved_player_id
    FROM resolved
    GROUP BY "draftId", resolved_player_id
    HAVING count(*) > 1
  )
  SELECT count(*) INTO violation_count FROM duplicates;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'AuctionResult.playerId backfill would create a duplicate player claim (% group(s))', violation_count;
  END IF;

  WITH resolved AS (
    SELECT
      pw.id,
      pw."draftId",
      COALESCE(
        pw."playerId",
        (
          SELECT min(p.id)
          FROM "Player" p
          WHERE p."draftId" = pw."draftId" AND p.name = pw."playerName"
          HAVING count(p.id) = 1
        )
      ) AS resolved_player_id
    FROM "PlayerWatchlist" pw
  ), duplicates AS (
    SELECT "draftId", resolved_player_id
    FROM resolved
    GROUP BY "draftId", resolved_player_id
    HAVING count(*) > 1
  )
  SELECT count(*) INTO violation_count FROM duplicates;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'PlayerWatchlist.playerId backfill would create a duplicate player entry (% group(s))', violation_count;
  END IF;

  WITH resolved AS (
    SELECT
      np.id,
      np."draftId",
      COALESCE(
        np."playerId",
        (
          SELECT min(p.id)
          FROM "Player" p
          WHERE p."draftId" = np."draftId" AND p.name = np."playerName"
          HAVING count(p.id) = 1
        )
      ) AS resolved_player_id
    FROM "NominatedPlayer" np
  ), duplicates AS (
    SELECT "draftId", resolved_player_id
    FROM resolved
    GROUP BY "draftId", resolved_player_id
    HAVING count(*) > 1
  )
  SELECT count(*) INTO violation_count FROM duplicates;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'NominatedPlayer.playerId backfill would create a duplicate player entry (% group(s))', violation_count;
  END IF;
END $$;

UPDATE "AuctionResult" ar
SET "playerId" = matches.player_id
FROM (
  SELECT ar2.id AS child_id, min(p.id) AS player_id
  FROM "AuctionResult" ar2
  JOIN "Player" p
    ON p."draftId" = ar2."draftId" AND p.name = ar2.player
  WHERE ar2."playerId" IS NULL
  GROUP BY ar2.id
  HAVING count(p.id) = 1
) matches
WHERE ar.id = matches.child_id;

UPDATE "PlayerWatchlist" pw
SET "playerId" = matches.player_id
FROM (
  SELECT pw2.id AS child_id, min(p.id) AS player_id
  FROM "PlayerWatchlist" pw2
  JOIN "Player" p
    ON p."draftId" = pw2."draftId" AND p.name = pw2."playerName"
  WHERE pw2."playerId" IS NULL
  GROUP BY pw2.id
  HAVING count(p.id) = 1
) matches
WHERE pw.id = matches.child_id;

UPDATE "NominatedPlayer" np
SET "playerId" = matches.player_id
FROM (
  SELECT np2.id AS child_id, min(p.id) AS player_id
  FROM "NominatedPlayer" np2
  JOIN "Player" p
    ON p."draftId" = np2."draftId" AND p.name = np2."playerName"
  WHERE np2."playerId" IS NULL
  GROUP BY np2.id
  HAVING count(p.id) = 1
) matches
WHERE np.id = matches.child_id;

DO $$
DECLARE
  violation_count bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM "AuctionResult" WHERE "playerId" IS NULL) +
    (SELECT count(*) FROM "PlayerWatchlist" WHERE "playerId" IS NULL) +
    (SELECT count(*) FROM "NominatedPlayer" WHERE "playerId" IS NULL)
  INTO violation_count;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Player identity backfill left unresolved rows (% row(s))', violation_count;
  END IF;

  SELECT
    (SELECT count(*)
     FROM "Draft" d JOIN "Team" t ON t.id = d."ownerTeamId"
     WHERE t."draftId" <> d.id) +
    (SELECT count(*)
     FROM "AuctionResult" ar JOIN "Team" t ON t.id = ar."teamId"
     WHERE t."draftId" <> ar."draftId") +
    (SELECT count(*)
     FROM "AuctionResult" ar JOIN "Player" p ON p.id = ar."playerId"
     WHERE p."draftId" <> ar."draftId") +
    (SELECT count(*)
     FROM "PlayerWatchlist" pw JOIN "Player" p ON p.id = pw."playerId"
     WHERE p."draftId" <> pw."draftId") +
    (SELECT count(*)
     FROM "NominatedPlayer" np JOIN "Player" p ON p.id = np."playerId"
     WHERE p."draftId" <> np."draftId") +
    (SELECT count(*)
     FROM "DraftPlayerValue" dpv JOIN "Player" p ON p.id = dpv."playerId"
     WHERE p."draftId" <> dpv."draftId")
  INTO violation_count;
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Same-draft relationship recheck failed (% row(s))', violation_count;
  END IF;
END $$;

ALTER TABLE "AuctionResult" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "PlayerWatchlist" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "NominatedPlayer" ALTER COLUMN "playerId" SET NOT NULL;

CREATE UNIQUE INDEX "Team_id_draftId_key" ON "Team"(id, "draftId");
CREATE UNIQUE INDEX "Player_id_draftId_key" ON "Player"(id, "draftId");

ALTER TABLE "Draft" DROP CONSTRAINT "Draft_ownerTeamId_fkey";
ALTER TABLE "AuctionResult" DROP CONSTRAINT "AuctionResult_teamId_fkey";
ALTER TABLE "AuctionResult" DROP CONSTRAINT "AuctionResult_playerId_fkey";
ALTER TABLE "PlayerWatchlist" DROP CONSTRAINT "PlayerWatchlist_playerId_fkey";
ALTER TABLE "NominatedPlayer" DROP CONSTRAINT "NominatedPlayer_playerId_fkey";
ALTER TABLE "DraftPlayerValue" DROP CONSTRAINT "DraftPlayerValue_playerId_fkey";

ALTER TABLE "Draft"
  ADD CONSTRAINT "Draft_ownerTeamId_id_fkey"
  FOREIGN KEY ("ownerTeamId", id) REFERENCES "Team"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_teamId_draftId_fkey"
  FOREIGN KEY ("teamId", "draftId") REFERENCES "Team"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "PlayerWatchlist"
  ADD CONSTRAINT "PlayerWatchlist_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "NominatedPlayer"
  ADD CONSTRAINT "NominatedPlayer_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "DraftPlayerValue"
  ADD CONSTRAINT "DraftPlayerValue_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;

ALTER TABLE "Draft" VALIDATE CONSTRAINT "Draft_ownerTeamId_id_fkey";
ALTER TABLE "AuctionResult" VALIDATE CONSTRAINT "AuctionResult_teamId_draftId_fkey";
ALTER TABLE "AuctionResult" VALIDATE CONSTRAINT "AuctionResult_playerId_draftId_fkey";
ALTER TABLE "PlayerWatchlist"
  VALIDATE CONSTRAINT "PlayerWatchlist_playerId_draftId_fkey";
ALTER TABLE "NominatedPlayer"
  VALIDATE CONSTRAINT "NominatedPlayer_playerId_draftId_fkey";
ALTER TABLE "DraftPlayerValue"
  VALIDATE CONSTRAINT "DraftPlayerValue_playerId_draftId_fkey";

CREATE INDEX "PlayerWatchlist_draftId_idx" ON "PlayerWatchlist"("draftId");
CREATE INDEX "NominatedPlayer_draftId_idx" ON "NominatedPlayer"("draftId");

COMMIT;
