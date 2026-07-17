ALTER TABLE "Draft"
ADD COLUMN "playerValueSourceBudget" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "UserRankingSet"
ADD COLUMN "sourceBudget" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "Draft"
ADD CONSTRAINT "Draft_playerValueSourceBudget_positive"
CHECK ("playerValueSourceBudget" > 0);

ALTER TABLE "UserRankingSet"
ADD CONSTRAINT "UserRankingSet_sourceBudget_positive"
CHECK ("sourceBudget" > 0);
