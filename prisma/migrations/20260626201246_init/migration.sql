-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "budget" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionResult" (
    "id" SERIAL NOT NULL,
    "player" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "sfRank" INTEGER,
    "notes" TEXT,
    "teamId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerWatchlist" (
    "id" SERIAL NOT NULL,
    "playerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerWatchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NominatedPlayer" (
    "id" SERIAL NOT NULL,
    "playerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NominatedPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_handle_key" ON "Team"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWatchlist_playerName_key" ON "PlayerWatchlist"("playerName");

-- CreateIndex
CREATE UNIQUE INDEX "NominatedPlayer_playerName_key" ON "NominatedPlayer"("playerName");

-- AddForeignKey
ALTER TABLE "AuctionResult" ADD CONSTRAINT "AuctionResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
