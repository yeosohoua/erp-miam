-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "logoId" TEXT;

-- AddForeignKey
ALTER TABLE "etablissements" ADD CONSTRAINT "etablissements_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
