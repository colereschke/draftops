-- CreateEnum
CREATE TYPE "OnboardingPhase" AS ENUM ('DRAFT_SETUP', 'FEATURE_TOUR', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM (
  'VALUE_SHEET_INTRO',
  'BID_PRACTICE',
  'BID_UNDO',
  'BUDGET_PRESSURE',
  'TEAM_ROSTERS',
  'NOMINATE_INTRO',
  'NOMINATE_PRACTICE',
  'NOMINATE_UNDO'
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "phase" "OnboardingPhase" NOT NULL,
  "step" "OnboardingStep" NOT NULL DEFAULT 'VALUE_SHEET_INTRO',
  "draftId" INTEGER,
  "subjectPlayerName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_draftId_key" ON "OnboardingProgress"("draftId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_draftId_idx" ON "OnboardingProgress"("draftId");

-- AddForeignKey
ALTER TABLE "OnboardingProgress"
ADD CONSTRAINT "OnboardingProgress_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
