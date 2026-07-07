ALTER TABLE "Player" ADD COLUMN "sleeperId" TEXT;

CREATE TABLE "ProjectionSource" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "season" INTEGER NOT NULL,
  "projectionDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectionSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerProjection" (
  "id" SERIAL NOT NULL,
  "sleeperId" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "games" DOUBLE PRECISION NOT NULL,
  "passAtt" DOUBLE PRECISION NOT NULL,
  "passCmp" DOUBLE PRECISION NOT NULL,
  "passYds" DOUBLE PRECISION NOT NULL,
  "passTd" DOUBLE PRECISION NOT NULL,
  "passInt" DOUBLE PRECISION NOT NULL,
  "passSacks" DOUBLE PRECISION NOT NULL,
  "rushAtt" DOUBLE PRECISION NOT NULL,
  "rushYds" DOUBLE PRECISION NOT NULL,
  "rushTd" DOUBLE PRECISION NOT NULL,
  "targets" DOUBLE PRECISION NOT NULL,
  "receptions" DOUBLE PRECISION NOT NULL,
  "recYds" DOUBLE PRECISION NOT NULL,
  "recTd" DOUBLE PRECISION NOT NULL,
  "baseFantasyPoints" DOUBLE PRECISION NOT NULL,
  "projectionRank" INTEGER,
  "projectionSourceId" INTEGER NOT NULL,

  CONSTRAINT "PlayerProjection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftPlayerValue" (
  "id" SERIAL NOT NULL,
  "draftId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "projectionSourceId" INTEGER,
  "projectedPoints" DOUBLE PRECISION,
  "replacementPoints" DOUBLE PRECISION,
  "vor" DOUBLE PRECISION,
  "projectionAuctionValue" INTEGER,
  "fallbackAuctionValue" INTEGER NOT NULL,
  "activeAuctionValue" INTEGER NOT NULL,
  "valueSource" TEXT NOT NULL DEFAULT 'fallback',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DraftPlayerValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectionSource_name_season_projectionDate_key"
  ON "ProjectionSource"("name", "season", "projectionDate");

CREATE UNIQUE INDEX "PlayerProjection_sleeperId_projectionSourceId_key"
  ON "PlayerProjection"("sleeperId", "projectionSourceId");
CREATE INDEX "PlayerProjection_sleeperId_idx" ON "PlayerProjection"("sleeperId");

CREATE UNIQUE INDEX "DraftPlayerValue_draftId_playerId_projectionSourceId_key"
  ON "DraftPlayerValue"("draftId", "playerId", "projectionSourceId");
CREATE INDEX "DraftPlayerValue_draftId_idx" ON "DraftPlayerValue"("draftId");
CREATE INDEX "DraftPlayerValue_playerId_idx" ON "DraftPlayerValue"("playerId");

CREATE INDEX "Player_sleeperId_idx" ON "Player"("sleeperId");

ALTER TABLE "PlayerProjection"
  ADD CONSTRAINT "PlayerProjection_projectionSourceId_fkey"
  FOREIGN KEY ("projectionSourceId") REFERENCES "ProjectionSource"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPlayerValue"
  ADD CONSTRAINT "DraftPlayerValue_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "Draft"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPlayerValue"
  ADD CONSTRAINT "DraftPlayerValue_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPlayerValue"
  ADD CONSTRAINT "DraftPlayerValue_projectionSourceId_fkey"
  FOREIGN KEY ("projectionSourceId") REFERENCES "ProjectionSource"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
