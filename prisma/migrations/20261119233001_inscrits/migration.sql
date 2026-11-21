-- CreateEnum
CREATE TYPE "ReferentielKind" AS ENUM ('GROUPE', 'REGIME', 'ALLERGIE');

-- CreateEnum
CREATE TYPE "InscritType" AS ENUM ('STUDENT', 'EMPLOYEE', 'GUEST');

-- CreateEnum
CREATE TYPE "InscritStatut" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateTable
CREATE TABLE "referentiels" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "kind" "ReferentielKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referentiels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscrits" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "type" "InscritType" NOT NULL DEFAULT 'STUDENT',
    "statut" "InscritStatut" NOT NULL DEFAULT 'ACTIVE',
    "groupeId" TEXT,
    "regimeId" TEXT,
    "badge" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscrits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscrit_allergies" (
    "inscritId" TEXT NOT NULL,
    "allergieId" TEXT NOT NULL,

    CONSTRAINT "inscrit_allergies_pkey" PRIMARY KEY ("inscritId","allergieId")
);

-- CreateTable
CREATE TABLE "tuteurs" (
    "id" TEXT NOT NULL,
    "inscritId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuteurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referentiels_etablissementId_kind_name_key" ON "referentiels"("etablissementId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inscrits_badge_key" ON "inscrits"("badge");

-- CreateIndex
CREATE INDEX "inscrits_etablissementId_lastName_idx" ON "inscrits"("etablissementId", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "inscrits_etablissementId_matricule_key" ON "inscrits"("etablissementId", "matricule");

-- CreateIndex
CREATE INDEX "tuteurs_inscritId_idx" ON "tuteurs"("inscritId");

-- AddForeignKey
ALTER TABLE "referentiels" ADD CONSTRAINT "referentiels_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscrits" ADD CONSTRAINT "inscrits_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscrits" ADD CONSTRAINT "inscrits_groupeId_fkey" FOREIGN KEY ("groupeId") REFERENCES "referentiels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscrits" ADD CONSTRAINT "inscrits_regimeId_fkey" FOREIGN KEY ("regimeId") REFERENCES "referentiels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscrit_allergies" ADD CONSTRAINT "inscrit_allergies_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscrit_allergies" ADD CONSTRAINT "inscrit_allergies_allergieId_fkey" FOREIGN KEY ("allergieId") REFERENCES "referentiels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuteurs" ADD CONSTRAINT "tuteurs_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
