-- CreateTable
CREATE TABLE "SleeperPlayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "age" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleeperPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRankingSet" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRankingSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRankingPlayer" (
    "id" SERIAL NOT NULL,
    "rankingSetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "age" DOUBLE PRECISION,
    "sfRank" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "ceiling" INTEGER NOT NULL,
    "floor" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "sleeperId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',

    CONSTRAINT "UserRankingPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleeperPlayer_normalizedName_idx" ON "SleeperPlayer"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "UserRankingSet_userId_key" ON "UserRankingSet"("userId");

-- CreateIndex
CREATE INDEX "UserRankingPlayer_rankingSetId_idx" ON "UserRankingPlayer"("rankingSetId");

-- AddForeignKey
ALTER TABLE "UserRankingPlayer" ADD CONSTRAINT "UserRankingPlayer_rankingSetId_fkey" FOREIGN KEY ("rankingSetId") REFERENCES "UserRankingSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
