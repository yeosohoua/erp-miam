-- AlterTable
ALTER TABLE "plats" ADD COLUMN     "imageId" TEXT;

-- AddForeignKey
ALTER TABLE "plats" ADD CONSTRAINT "plats_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
