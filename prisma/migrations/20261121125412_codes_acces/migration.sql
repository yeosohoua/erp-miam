-- CreateEnum
CREATE TYPE "CibleAcces" AS ENUM ('INSCRIT', 'EMPLOYE', 'PARENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'ELEVE';
ALTER TYPE "Role" ADD VALUE 'EMPLOYE';

-- CreateTable
CREATE TABLE "codes_acces" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "cible" "CibleAcces" NOT NULL,
    "inscritId" TEXT,
    "employeId" TEXT,
    "tuteurEmail" TEXT,
    "userId" TEXT,
    "codeHash" TEXT NOT NULL,
    "codeChiffre" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "codes_acces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_inscritId_key" ON "codes_acces"("inscritId");

-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_employeId_key" ON "codes_acces"("employeId");

-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_userId_key" ON "codes_acces"("userId");

-- CreateIndex
CREATE INDEX "codes_acces_etablissementId_cible_idx" ON "codes_acces"("etablissementId", "cible");

-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_etablissementId_codeHash_key" ON "codes_acces"("etablissementId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_etablissementId_tuteurEmail_key" ON "codes_acces"("etablissementId", "tuteurEmail");

-- AddForeignKey
ALTER TABLE "codes_acces" ADD CONSTRAINT "codes_acces_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codes_acces" ADD CONSTRAINT "codes_acces_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codes_acces" ADD CONSTRAINT "codes_acces_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codes_acces" ADD CONSTRAINT "codes_acces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
