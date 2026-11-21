-- CreateEnum
CREATE TYPE "MethodePaiement" AS ENUM ('CASH', 'ORANGE', 'MTN', 'WAVE', 'MOOV');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TOPUP', 'DEBIT', 'REFUND', 'ADJUST');

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "prepaye" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "inscrits" ADD COLUMN     "solde" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tarifs" (
    "etablissementId" TEXT NOT NULL,
    "service" "MenuService" NOT NULL,
    "prix" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tarifs_pkey" PRIMARY KEY ("etablissementId","service")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "inscritId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "methode" "MethodePaiement",
    "montant" INTEGER NOT NULL,
    "reference" TEXT,
    "reservationId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_inscritId_createdAt_idx" ON "transactions"("inscritId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_etablissementId_createdAt_idx" ON "transactions"("etablissementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_etablissementId_reference_key" ON "transactions"("etablissementId", "reference");

-- AddForeignKey
ALTER TABLE "tarifs" ADD CONSTRAINT "tarifs_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
