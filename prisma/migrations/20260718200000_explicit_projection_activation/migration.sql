CREATE TYPE "DraftProjectionValueSetStatus" AS ENUM (
  'STAGING',
  'ACTIVE',
  'ARCHIVED',
  'FAILED'
);

CREATE TABLE "DraftProjectionValueSet" (
  id SERIAL NOT NULL,
  "draftId" INTEGER NOT NULL,
  "projectionSourceId" INTEGER,
  status "DraftProjectionValueSetStatus" NOT NULL DEFAULT 'STAGING',
  "expectedPlayerCount" INTEGER NOT NULL,
  "appliedPlayerCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,

  CONSTRAINT "DraftProjectionValueSet_pkey" PRIMARY KEY (id),
  CONSTRAINT "DraftProjectionValueSet_expectedPlayerCount_nonnegative"
    CHECK ("expectedPlayerCount" >= 0),
  CONSTRAINT "DraftProjectionValueSet_appliedPlayerCount_nonnegative"
    CHECK ("appliedPlayerCount" >= 0)
);

ALTER TABLE "Draft"
ADD COLUMN "activeProjectionValueSetId" INTEGER;

ALTER TABLE "DraftPlayerValue"
ADD COLUMN "valueSetId" INTEGER;

INSERT INTO "DraftProjectionValueSet" (
  "draftId",
  "projectionSourceId",
  status,
  "expectedPlayerCount",
  "appliedPlayerCount",
  "createdAt",
  "activatedAt"
)
SELECT
  "draftId",
  "projectionSourceId",
  'ARCHIVED',
  COUNT(*)::integer,
  COUNT(*)::integer,
  MIN("createdAt"),
  MAX("updatedAt")
FROM "DraftPlayerValue"
GROUP BY "draftId", "projectionSourceId";

UPDATE "DraftPlayerValue" value
SET "valueSetId" = value_set.id
FROM "DraftProjectionValueSet" value_set
WHERE value_set."draftId" = value."draftId"
  AND value_set."projectionSourceId" IS NOT DISTINCT FROM value."projectionSourceId";

WITH ranked_sets AS (
  SELECT
    id,
    "draftId",
    ROW_NUMBER() OVER (
      PARTITION BY "draftId"
      ORDER BY "activatedAt" DESC NULLS LAST, id DESC
    ) AS activation_rank
  FROM "DraftProjectionValueSet"
)
UPDATE "DraftProjectionValueSet" value_set
SET status = 'ACTIVE'
FROM ranked_sets
WHERE value_set.id = ranked_sets.id
  AND ranked_sets.activation_rank = 1;

UPDATE "Draft" draft
SET "activeProjectionValueSetId" = value_set.id
FROM "DraftProjectionValueSet" value_set
WHERE value_set."draftId" = draft.id
  AND value_set.status = 'ACTIVE';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DraftPlayerValue" WHERE "valueSetId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require DraftPlayerValue.valueSetId: projection value rows were not backfilled';
  END IF;
END $$;

ALTER TABLE "DraftPlayerValue"
ALTER COLUMN "valueSetId" SET NOT NULL;

DROP INDEX "DraftPlayerValue_draftId_playerId_projectionSourceId_key";

CREATE UNIQUE INDEX "Draft_activeProjectionValueSetId_key"
ON "Draft"("activeProjectionValueSetId");

CREATE UNIQUE INDEX "Draft_activeProjectionValueSetId_id_key"
ON "Draft"("activeProjectionValueSetId", id);

CREATE UNIQUE INDEX "DraftProjectionValueSet_id_draftId_key"
ON "DraftProjectionValueSet"(id, "draftId");

CREATE UNIQUE INDEX "DraftProjectionValueSet_id_draftId_projectionSourceId_key"
ON "DraftProjectionValueSet"(id, "draftId", "projectionSourceId");

CREATE UNIQUE INDEX "DraftProjectionValueSet_one_active_per_draft"
ON "DraftProjectionValueSet"("draftId")
WHERE status = 'ACTIVE';

CREATE INDEX "DraftProjectionValueSet_draftId_activatedAt_idx"
ON "DraftProjectionValueSet"("draftId", "activatedAt");

CREATE INDEX "DraftProjectionValueSet_projectionSourceId_idx"
ON "DraftProjectionValueSet"("projectionSourceId");

CREATE UNIQUE INDEX "DraftPlayerValue_valueSetId_playerId_key"
ON "DraftPlayerValue"("valueSetId", "playerId");

ALTER TABLE "DraftProjectionValueSet"
ADD CONSTRAINT "DraftProjectionValueSet_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "Draft"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftProjectionValueSet"
ADD CONSTRAINT "DraftProjectionValueSet_projectionSourceId_fkey"
FOREIGN KEY ("projectionSourceId") REFERENCES "ProjectionSource"(id)
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Draft"
ADD CONSTRAINT "Draft_activeProjectionValueSetId_id_fkey"
FOREIGN KEY ("activeProjectionValueSetId", id)
REFERENCES "DraftProjectionValueSet"(id, "draftId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPlayerValue"
ADD CONSTRAINT "DraftPlayerValue_valueSetId_draftId_fkey"
FOREIGN KEY ("valueSetId", "draftId")
REFERENCES "DraftProjectionValueSet"(id, "draftId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPlayerValue"
ADD CONSTRAINT "DraftPlayerValue_valueSetId_draftId_projectionSourceId_fkey"
FOREIGN KEY ("valueSetId", "draftId", "projectionSourceId")
REFERENCES "DraftProjectionValueSet"(id, "draftId", "projectionSourceId")
ON DELETE RESTRICT ON UPDATE CASCADE;
