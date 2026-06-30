-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('ACTIVE', 'COMPLETE');

-- DropIndex
DROP INDEX "Draft_ownerId_key";

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "status" "DraftStatus" NOT NULL DEFAULT 'ACTIVE';
