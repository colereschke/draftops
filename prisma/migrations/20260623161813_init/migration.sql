-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "budget" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuctionResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "sfRank" INTEGER,
    "notes" TEXT,
    "teamId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_handle_key" ON "Team"("handle");
