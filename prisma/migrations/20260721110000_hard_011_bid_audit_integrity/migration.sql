ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_id_draftId_key" UNIQUE ("id", "draftId");

ALTER TABLE "BidAuditEvent"
  DROP CONSTRAINT "BidAuditEvent_bidId_fkey";

ALTER TABLE "BidAuditEvent"
  ADD CONSTRAINT "BidAuditEvent_bidId_draftId_fkey"
  FOREIGN KEY ("bidId", "draftId") REFERENCES "AuctionResult"("id", "draftId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
