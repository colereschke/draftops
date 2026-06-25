-- CreateTable
CREATE TABLE "PlayerWatchlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWatchlist_playerName_key" ON "PlayerWatchlist"("playerName");
