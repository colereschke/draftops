CREATE TYPE "BidAuditEventType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'SUPERSEDE');

ALTER TABLE "AuctionResult"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "supersededAt" TIMESTAMP(3);

DROP INDEX "AuctionResult_draftId_playerId_key";

CREATE UNIQUE INDEX "AuctionResult_active_draft_player_key"
  ON "AuctionResult"("draftId", "playerId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "AuctionResult_draftId_deletedAt_idx"
  ON "AuctionResult"("draftId", "deletedAt");

CREATE TABLE "BidAuditEvent" (
  "id" SERIAL NOT NULL,
  "draftId" INTEGER NOT NULL,
  "bidId" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" "BidAuditEventType" NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BidAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BidAuditEvent_draftId_occurredAt_id_idx"
  ON "BidAuditEvent"("draftId", "occurredAt", "id");
CREATE INDEX "BidAuditEvent_bidId_idx" ON "BidAuditEvent"("bidId");

ALTER TABLE "BidAuditEvent"
  ADD CONSTRAINT "BidAuditEvent_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BidAuditEvent_bidId_fkey"
  FOREIGN KEY ("bidId") REFERENCES "AuctionResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DraftCompletionSnapshot" (
  "id" SERIAL NOT NULL,
  "draftId" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "schemaVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "DraftCompletionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftCompletionSnapshot_draftId_key"
  ON "DraftCompletionSnapshot"("draftId");

ALTER TABLE "DraftCompletionSnapshot"
  ADD CONSTRAINT "DraftCompletionSnapshot_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
