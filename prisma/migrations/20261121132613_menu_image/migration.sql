-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "imageId" TEXT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
