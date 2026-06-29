-- AlterTable: add unique constraint on Draft.ownerId
CREATE UNIQUE INDEX "Draft_ownerId_key" ON "Draft"("ownerId");
