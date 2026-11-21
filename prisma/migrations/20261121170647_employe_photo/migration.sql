-- AlterTable
ALTER TABLE "employes_rh" ADD COLUMN     "imageId" TEXT;

-- AddForeignKey
ALTER TABLE "employes_rh" ADD CONSTRAINT "employes_rh_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
