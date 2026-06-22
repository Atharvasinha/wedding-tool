-- CreateEnum
CREATE TYPE "email_direction" AS ENUM ('incoming', 'outgoing');

-- AlterTable
ALTER TABLE "email_items" ADD COLUMN     "direction" "email_direction" NOT NULL DEFAULT 'incoming';
