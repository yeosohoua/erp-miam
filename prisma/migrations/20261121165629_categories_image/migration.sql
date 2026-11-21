-- AlterTable
ALTER TABLE "categories_articles" ADD COLUMN     "imageId" TEXT;

-- AddForeignKey
ALTER TABLE "categories_articles" ADD CONSTRAINT "categories_articles_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
