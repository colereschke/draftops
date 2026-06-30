-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "budget" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "rosterSize" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "scoringSettings" JSONB,
ADD COLUMN     "startingLineup" JSONB,
ADD COLUMN     "targetRoster" JSONB,
ADD COLUMN     "teamCount" INTEGER NOT NULL DEFAULT 12;

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nflTeam" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "age" DOUBLE PRECISION,
    "sfRank" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "ceiling" INTEGER NOT NULL,
    "floor" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "draftId" INTEGER NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_name_draftId_key" ON "Player"("name", "draftId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
