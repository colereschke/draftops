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

-- Backfill generated owner-labeled future pick assets for drafts that already have players.
-- Legacy untagged PICK/PKG rows remain in place for history, but are hidden from active auction
-- surfaces by application filtering because they have no futurePickAssetKind metadata.
WITH team_assets AS (
    SELECT
        t."draftId",
        t.handle,
        EXTRACT(YEAR FROM d."createdAt")::int + 1 AS pick_year,
        (ROW_NUMBER() OVER (PARTITION BY t."draftId" ORDER BY t.handle, t.id) - 1)::int AS team_offset
    FROM "Team" t
    JOIN "Draft" d ON d.id = t."draftId"
),
generated_assets AS (
    SELECT
        CONCAT(handle, '''s ', pick_year, ' package') AS name,
        handle AS "nflTeam",
        'PKG' AS pos,
        NULL::double precision AS age,
        900 + team_offset * 4 AS "sfRank",
        109 AS budget,
        131 AS ceiling,
        75 AS floor,
        109 AS "baseBudget",
        131 AS "baseCeiling",
        75 AS "baseFloor",
        NULL::text AS "sleeperId",
        CONCAT(handle, '''s ', pick_year, ' 1st+2nd+3rd') AS notes,
        pick_year AS "futurePickYear",
        NULL::integer AS "futurePickRound",
        handle AS "futurePickOriginHandle",
        'package' AS "futurePickAssetKind",
        "draftId"
    FROM team_assets
    UNION ALL
    SELECT
        CONCAT(handle, ' ', pick_year, ' 1st') AS name,
        handle AS "nflTeam",
        'PICK' AS pos,
        NULL::double precision AS age,
        901 + team_offset * 4 AS "sfRank",
        75 AS budget,
        90 AS ceiling,
        52 AS floor,
        75 AS "baseBudget",
        90 AS "baseCeiling",
        52 AS "baseFloor",
        NULL::text AS "sleeperId",
        CONCAT(handle, '''s ', pick_year, ' 1st round pick') AS notes,
        pick_year AS "futurePickYear",
        1 AS "futurePickRound",
        handle AS "futurePickOriginHandle",
        'pick' AS "futurePickAssetKind",
        "draftId"
    FROM team_assets
    UNION ALL
    SELECT
        CONCAT(handle, ' ', pick_year, ' 2nd') AS name,
        handle AS "nflTeam",
        'PICK' AS pos,
        NULL::double precision AS age,
        902 + team_offset * 4 AS "sfRank",
        15 AS budget,
        18 AS ceiling,
        10 AS floor,
        15 AS "baseBudget",
        18 AS "baseCeiling",
        10 AS "baseFloor",
        NULL::text AS "sleeperId",
        CONCAT(handle, '''s ', pick_year, ' 2nd round pick') AS notes,
        pick_year AS "futurePickYear",
        2 AS "futurePickRound",
        handle AS "futurePickOriginHandle",
        'pick' AS "futurePickAssetKind",
        "draftId"
    FROM team_assets
    UNION ALL
    SELECT
        CONCAT(handle, ' ', pick_year, ' 3rd') AS name,
        handle AS "nflTeam",
        'PICK' AS pos,
        NULL::double precision AS age,
        903 + team_offset * 4 AS "sfRank",
        5 AS budget,
        6 AS ceiling,
        5 AS floor,
        5 AS "baseBudget",
        6 AS "baseCeiling",
        5 AS "baseFloor",
        NULL::text AS "sleeperId",
        CONCAT(handle, '''s ', pick_year, ' 3rd round pick') AS notes,
        pick_year AS "futurePickYear",
        3 AS "futurePickRound",
        handle AS "futurePickOriginHandle",
        'pick' AS "futurePickAssetKind",
        "draftId"
    FROM team_assets
)
INSERT INTO "Player" (
    name,
    "nflTeam",
    pos,
    age,
    "sfRank",
    budget,
    ceiling,
    floor,
    "baseBudget",
    "baseCeiling",
    "baseFloor",
    "sleeperId",
    notes,
    "futurePickYear",
    "futurePickRound",
    "futurePickOriginHandle",
    "futurePickAssetKind",
    "draftId"
)
SELECT
    name,
    "nflTeam",
    pos,
    age,
    "sfRank",
    budget,
    ceiling,
    floor,
    "baseBudget",
    "baseCeiling",
    "baseFloor",
    "sleeperId",
    notes,
    "futurePickYear",
    "futurePickRound",
    "futurePickOriginHandle",
    "futurePickAssetKind",
    "draftId"
FROM generated_assets
ON CONFLICT (name, "draftId") DO NOTHING;

-- Move completed/live legacy kicker-package references onto the generated owner-labeled
-- package rows so existing wins remain claimed after legacy static rows are hidden.
WITH legacy_kicker_packages(kicker_name, origin_handle) AS (
    VALUES
        ('Cameron Dicker', 'chappy72'),
        ('Tyler Loop', 'DrFunk'),
        ('Brandon Aubrey', 'Henrizzler87'),
        ('Jake Bates', 'CharlesChillFFB'),
        ('Tyler Bass', 'moneymarkel2626'),
        ('Cam Little', 'sam4bama'),
        ('Nick Folk', 'mattveksler'),
        ('Matt Gay', 'coreschke'),
        ('Will Lutz', 'gaf2323'),
        ('Harrison Butker', 'dark44'),
        ('Jason Sanders', 'SlamminSam58'),
        ('Chris Boswell', 'JHenny74')
),
legacy_package_targets AS (
    SELECT
        d.id AS "draftId",
        l.kicker_name,
        l.origin_handle,
        CONCAT(l.origin_handle, '''s ', EXTRACT(YEAR FROM d."createdAt")::int + 1, ' package') AS package_name
    FROM "Draft" d
    JOIN legacy_kicker_packages l ON TRUE
    JOIN "Team" t ON t."draftId" = d.id AND t.handle = l.origin_handle
)
UPDATE "AuctionResult" ar
SET
    player = target.package_name,
    "nflTeam" = target.origin_handle
FROM legacy_package_targets target
WHERE ar."draftId" = target."draftId"
  AND ar.player = target.kicker_name
  AND ar.position = 'PKG';

WITH legacy_kicker_packages(kicker_name, origin_handle) AS (
    VALUES
        ('Cameron Dicker', 'chappy72'),
        ('Tyler Loop', 'DrFunk'),
        ('Brandon Aubrey', 'Henrizzler87'),
        ('Jake Bates', 'CharlesChillFFB'),
        ('Tyler Bass', 'moneymarkel2626'),
        ('Cam Little', 'sam4bama'),
        ('Nick Folk', 'mattveksler'),
        ('Matt Gay', 'coreschke'),
        ('Will Lutz', 'gaf2323'),
        ('Harrison Butker', 'dark44'),
        ('Jason Sanders', 'SlamminSam58'),
        ('Chris Boswell', 'JHenny74')
),
legacy_package_targets AS (
    SELECT
        d.id AS "draftId",
        l.kicker_name,
        CONCAT(l.origin_handle, '''s ', EXTRACT(YEAR FROM d."createdAt")::int + 1, ' package') AS package_name
    FROM "Draft" d
    JOIN legacy_kicker_packages l ON TRUE
    JOIN "Team" t ON t."draftId" = d.id AND t.handle = l.origin_handle
)
UPDATE "NominatedPlayer" np
SET "playerName" = target.package_name
FROM legacy_package_targets target
WHERE np."draftId" = target."draftId"
  AND np."playerName" = target.kicker_name
  AND NOT EXISTS (
      SELECT 1
      FROM "NominatedPlayer" existing
      WHERE existing."draftId" = np."draftId"
        AND existing."playerName" = target.package_name
  );

WITH legacy_kicker_packages(kicker_name, origin_handle) AS (
    VALUES
        ('Cameron Dicker', 'chappy72'),
        ('Tyler Loop', 'DrFunk'),
        ('Brandon Aubrey', 'Henrizzler87'),
        ('Jake Bates', 'CharlesChillFFB'),
        ('Tyler Bass', 'moneymarkel2626'),
        ('Cam Little', 'sam4bama'),
        ('Nick Folk', 'mattveksler'),
        ('Matt Gay', 'coreschke'),
        ('Will Lutz', 'gaf2323'),
        ('Harrison Butker', 'dark44'),
        ('Jason Sanders', 'SlamminSam58'),
        ('Chris Boswell', 'JHenny74')
),
legacy_package_targets AS (
    SELECT
        d.id AS "draftId",
        l.kicker_name,
        CONCAT(l.origin_handle, '''s ', EXTRACT(YEAR FROM d."createdAt")::int + 1, ' package') AS package_name
    FROM "Draft" d
    JOIN legacy_kicker_packages l ON TRUE
    JOIN "Team" t ON t."draftId" = d.id AND t.handle = l.origin_handle
)
UPDATE "PlayerWatchlist" pw
SET "playerName" = target.package_name
FROM legacy_package_targets target
WHERE pw."draftId" = target."draftId"
  AND pw."playerName" = target.kicker_name
  AND NOT EXISTS (
      SELECT 1
      FROM "PlayerWatchlist" existing
      WHERE existing."draftId" = pw."draftId"
        AND existing."playerName" = target.package_name
  );
