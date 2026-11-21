-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "inscrits" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "factureId" TEXT;

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "numero" INTEGER,
    "periode" TEXT NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'DRAFT',
    "total" INTEGER NOT NULL,
    "emisLe" TIMESTAMP(3),
    "echeance" DATE,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture_lignes" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "facture_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglements" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "methode" "MethodePaiement" NOT NULL,
    "reference" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relances" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_etablissementId_name_key" ON "clients"("etablissementId", "name");

-- CreateIndex
CREATE INDEX "factures_etablissementId_statut_idx" ON "factures"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "factures_clientId_idx" ON "factures"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "factures_etablissementId_numero_key" ON "factures"("etablissementId", "numero");

-- CreateIndex
CREATE INDEX "facture_lignes_factureId_idx" ON "facture_lignes"("factureId");

-- CreateIndex
CREATE INDEX "reglements_factureId_idx" ON "reglements"("factureId");

-- CreateIndex
CREATE UNIQUE INDEX "reglements_etablissementId_reference_key" ON "reglements"("etablissementId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "relances_factureId_niveau_key" ON "relances"("factureId", "niveau");

-- CreateIndex
CREATE INDEX "inscrits_clientId_idx" ON "inscrits"("clientId");

-- CreateIndex
CREATE INDEX "reservations_factureId_idx" ON "reservations"("factureId");

-- AddForeignKey
ALTER TABLE "inscrits" ADD CONSTRAINT "inscrits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_lignes" ADD CONSTRAINT "facture_lignes_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglements" ADD CONSTRAINT "reglements_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglements" ADD CONSTRAINT "reglements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
