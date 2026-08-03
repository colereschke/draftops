-- AlterTable
ALTER TABLE "AuctionResult" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "budgetTeamId" INTEGER NOT NULL,
    "pickTeamId" INTEGER NOT NULL,
    "budgetAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePickAsset" (
    "id" SERIAL NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "draftId" INTEGER NOT NULL,
    "originTeamId" INTEGER NOT NULL,
    "futurePickYear" INTEGER NOT NULL,
    "futurePickRound" INTEGER NOT NULL,

    CONSTRAINT "TradePickAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAuditEvent" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "BidAuditEventType" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_draftId_deletedAt_idx" ON "Trade"("draftId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_id_draftId_key" ON "Trade"("id", "draftId");

-- CreateIndex
CREATE INDEX "TradePickAsset_draftId_originTeamId_futurePickYear_futurePi_idx" ON "TradePickAsset"("draftId", "originTeamId", "futurePickYear", "futurePickRound");

-- CreateIndex
CREATE UNIQUE INDEX "TradePickAsset_tradeId_originTeamId_futurePickYear_futurePi_key" ON "TradePickAsset"("tradeId", "originTeamId", "futurePickYear", "futurePickRound");

-- CreateIndex
CREATE INDEX "TradeAuditEvent_draftId_occurredAt_id_idx" ON "TradeAuditEvent"("draftId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "TradeAuditEvent_tradeId_idx" ON "TradeAuditEvent"("tradeId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_budgetTeamId_draftId_fkey" FOREIGN KEY ("budgetTeamId", "draftId") REFERENCES "Team"("id", "draftId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_pickTeamId_draftId_fkey" FOREIGN KEY ("pickTeamId", "draftId") REFERENCES "Team"("id", "draftId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TradePickAsset" ADD CONSTRAINT "TradePickAsset_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePickAsset" ADD CONSTRAINT "TradePickAsset_tradeId_draftId_fkey" FOREIGN KEY ("tradeId", "draftId") REFERENCES "Trade"("id", "draftId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TradePickAsset" ADD CONSTRAINT "TradePickAsset_originTeamId_draftId_fkey" FOREIGN KEY ("originTeamId", "draftId") REFERENCES "Team"("id", "draftId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TradeAuditEvent" ADD CONSTRAINT "TradeAuditEvent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAuditEvent" ADD CONSTRAINT "TradeAuditEvent_tradeId_draftId_fkey" FOREIGN KEY ("tradeId", "draftId") REFERENCES "Trade"("id", "draftId") ON DELETE RESTRICT ON UPDATE CASCADE;
