-- CreateEnum
CREATE TYPE "SituationFamiliale" AS ENUM ('CELIBATAIRE', 'MARIE', 'DIVORCE', 'VEUF');

-- CreateEnum
CREATE TYPE "StatutBulletin" AS ENUM ('DRAFT', 'VALIDATED');

-- CreateTable
CREATE TABLE "employes_rh" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "poste" TEXT,
    "dateEmbauche" DATE NOT NULL,
    "salaireBase" INTEGER NOT NULL,
    "primes" INTEGER NOT NULL DEFAULT 0,
    "indemniteExoneree" INTEGER NOT NULL DEFAULT 0,
    "situation" "SituationFamiliale" NOT NULL DEFAULT 'CELIBATAIRE',
    "enfants" INTEGER NOT NULL DEFAULT 0,
    "personnesCmu" INTEGER NOT NULL DEFAULT 1,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employes_rh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametres_paie" (
    "etablissementId" TEXT NOT NULL,
    "retraiteSalarieBp" INTEGER NOT NULL DEFAULT 630,
    "retraitePatronalBp" INTEGER NOT NULL DEFAULT 770,
    "pfBp" INTEGER NOT NULL DEFAULT 500,
    "materniteBp" INTEGER NOT NULL DEFAULT 75,
    "atBp" INTEGER NOT NULL DEFAULT 200,
    "plafondRetraite" INTEGER NOT NULL DEFAULT 3375000,
    "plafondAutres" INTEGER NOT NULL DEFAULT 75000,
    "plancher" INTEGER NOT NULL DEFAULT 75000,
    "cmuSalarie" INTEGER NOT NULL DEFAULT 500,
    "cmuPatronale" INTEGER NOT NULL DEFAULT 500,
    "contributionBp" INTEGER NOT NULL DEFAULT 120,
    "apprentissageBp" INTEGER NOT NULL DEFAULT 40,
    "tfpcBp" INTEGER NOT NULL DEFAULT 120,
    "ricfDemiPart" INTEGER NOT NULL DEFAULT 5500,
    "cnpsDeductibleIts" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "parametres_paie_pkey" PRIMARY KEY ("etablissementId")
);

-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "statut" "StatutBulletin" NOT NULL DEFAULT 'DRAFT',
    "brut" INTEGER NOT NULL,
    "partsX2" INTEGER NOT NULL,
    "baseIts" INTEGER NOT NULL,
    "its" INTEGER NOT NULL,
    "retraiteSalarie" INTEGER NOT NULL,
    "cmuSalarie" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "retraitePatronale" INTEGER NOT NULL,
    "pf" INTEGER NOT NULL,
    "maternite" INTEGER NOT NULL,
    "at" INTEGER NOT NULL,
    "cmuPatronale" INTEGER NOT NULL,
    "taxesPatronales" INTEGER NOT NULL,
    "coutEmployeur" INTEGER NOT NULL,
    "valideLe" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employes_rh_etablissementId_matricule_key" ON "employes_rh"("etablissementId", "matricule");

-- CreateIndex
CREATE INDEX "bulletins_paie_etablissementId_periode_idx" ON "bulletins_paie"("etablissementId", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_employeId_periode_key" ON "bulletins_paie"("employeId", "periode");

-- AddForeignKey
ALTER TABLE "employes_rh" ADD CONSTRAINT "employes_rh_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_paie" ADD CONSTRAINT "parametres_paie_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;
