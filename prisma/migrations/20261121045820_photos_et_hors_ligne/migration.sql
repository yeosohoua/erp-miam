/*
  Warnings:

  - A unique constraint covering the columns `[etablissementId,cleHorsLigne]` on the table `ventes_comptoir` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "inscrits" ADD COLUMN     "imageId" TEXT;

-- AlterTable
ALTER TABLE "ventes_comptoir" ADD COLUMN     "cleHorsLigne" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ventes_comptoir_etablissementId_cleHorsLigne_key" ON "ventes_comptoir"("etablissementId", "cleHorsLigne");

-- AddForeignKey
ALTER TABLE "inscrits" ADD CONSTRAINT "inscrits_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
