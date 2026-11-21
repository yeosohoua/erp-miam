-- CreateEnum
CREATE TYPE "StatutPaiementEnLigne" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "MethodePaiement" ADD VALUE 'PAYSTACK';

-- CreateTable
CREATE TABLE "paiements_en_ligne" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "inscritId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "statut" "StatutPaiementEnLigne" NOT NULL DEFAULT 'PENDING',
    "canal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "paiements_en_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paiements_en_ligne_reference_key" ON "paiements_en_ligne"("reference");

-- CreateIndex
CREATE INDEX "paiements_en_ligne_inscritId_createdAt_idx" ON "paiements_en_ligne"("inscritId", "createdAt");

-- CreateIndex
CREATE INDEX "paiements_en_ligne_etablissementId_createdAt_idx" ON "paiements_en_ligne"("etablissementId", "createdAt");

-- AddForeignKey
ALTER TABLE "paiements_en_ligne" ADD CONSTRAINT "paiements_en_ligne_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_en_ligne" ADD CONSTRAINT "paiements_en_ligne_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
