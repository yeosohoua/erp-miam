-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('ENTREE', 'SORTIE', 'PERTE', 'INVENTAIRE');

-- CreateEnum
CREATE TYPE "StatutBon" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "seuil" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "stock" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fournisseurs" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fournisseurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_commande" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "numero" INTEGER,
    "statut" "StatutBon" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "envoyeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bons_commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bon_commande_lignes" (
    "id" TEXT NOT NULL,
    "bonId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "prix" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "recue" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "bon_commande_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "restante" DECIMAL(14,3) NOT NULL,
    "prix" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "peremption" DATE,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bonId" TEXT,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_stock" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "TypeMouvement" NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "prix" DECIMAL(14,4),
    "reference" TEXT,
    "note" TEXT,
    "bonId" TEXT,
    "consommationId" TEXT,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consommations" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "repas" INTEGER NOT NULL,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consommations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fournisseurs_etablissementId_name_key" ON "fournisseurs"("etablissementId", "name");

-- CreateIndex
CREATE INDEX "bons_commande_etablissementId_statut_idx" ON "bons_commande"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "bons_commande_fournisseurId_idx" ON "bons_commande"("fournisseurId");

-- CreateIndex
CREATE UNIQUE INDEX "bons_commande_etablissementId_numero_key" ON "bons_commande"("etablissementId", "numero");

-- CreateIndex
CREATE INDEX "bon_commande_lignes_ingredientId_idx" ON "bon_commande_lignes"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "bon_commande_lignes_bonId_ingredientId_key" ON "bon_commande_lignes"("bonId", "ingredientId");

-- CreateIndex
CREATE INDEX "lots_ingredientId_restante_idx" ON "lots"("ingredientId", "restante");

-- CreateIndex
CREATE INDEX "lots_etablissementId_idx" ON "lots"("etablissementId");

-- CreateIndex
CREATE INDEX "mouvements_stock_ingredientId_createdAt_idx" ON "mouvements_stock"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "mouvements_stock_etablissementId_createdAt_idx" ON "mouvements_stock"("etablissementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "consommations_etablissementId_date_service_key" ON "consommations"("etablissementId", "date", "service");

-- AddForeignKey
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_commande" ADD CONSTRAINT "bons_commande_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_commande" ADD CONSTRAINT "bons_commande_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_commande_lignes" ADD CONSTRAINT "bon_commande_lignes_bonId_fkey" FOREIGN KEY ("bonId") REFERENCES "bons_commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_commande_lignes" ADD CONSTRAINT "bon_commande_lignes_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consommations" ADD CONSTRAINT "consommations_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
