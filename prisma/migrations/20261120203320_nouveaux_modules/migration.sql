-- CreateEnum
CREATE TYPE "TypeAide" AS ENUM ('POURCENTAGE', 'MONTANT', 'GRATUIT');

-- CreateEnum
CREATE TYPE "TypeConge" AS ENUM ('ANNUEL', 'MALADIE', 'MATERNITE', 'PERMISSION', 'SANS_SOLDE');

-- CreateEnum
CREATE TYPE "StatutConge" AS ENUM ('DEMANDE', 'APPROUVE', 'REFUSE');

-- CreateEnum
CREATE TYPE "StatutPointage" AS ENUM ('PRESENT', 'ABSENT', 'RETARD');

-- CreateEnum
CREATE TYPE "TypeCertification" AS ENUM ('VISITE_MEDICALE', 'FORMATION_HYGIENE', 'HACCP', 'PREMIERS_SECOURS');

-- CreateEnum
CREATE TYPE "SourceAvis" AS ENUM ('PARENT', 'ELEVE', 'PERSONNEL', 'COMPTOIR');

-- CreateEnum
CREATE TYPE "StatutSuggestion" AS ENUM ('NOUVELLE', 'EN_COURS', 'TRAITEE', 'REJETEE');

-- CreateEnum
CREATE TYPE "TypeEquipement" AS ENUM ('REFRIGERATEUR', 'CONGELATEUR', 'CHAMBRE_FROIDE', 'BAIN_MARIE', 'VITRINE');

-- CreateEnum
CREATE TYPE "GraviteNC" AS ENUM ('MINEURE', 'MAJEURE', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "StatutNC" AS ENUM ('OUVERTE', 'CORRIGEE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "FrequenceHygiene" AS ENUM ('QUOTIDIENNE', 'HEBDOMADAIRE');

-- CreateEnum
CREATE TYPE "StatutTransfert" AS ENUM ('PREPARE', 'EXPEDIE', 'RECU', 'ANNULE');

-- CreateTable
CREATE TABLE "aides" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeAide" NOT NULL,
    "valeur" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aides_inscrits" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "inscritId" TEXT NOT NULL,
    "aideId" TEXT NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE,
    "motif" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aides_inscrits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conges" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "type" "TypeConge" NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "jours" INTEGER NOT NULL,
    "statut" "StatutConge" NOT NULL DEFAULT 'DEMANDE',
    "motif" TEXT,
    "decidePar" TEXT,
    "decideLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pointages" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "statut" "StatutPointage" NOT NULL DEFAULT 'PRESENT',
    "minutesRetard" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pointages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications_rh" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "type" "TypeCertification" NOT NULL,
    "delivreeLe" DATE NOT NULL,
    "expireLe" DATE NOT NULL,
    "organisme" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certifications_rh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avis" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "platId" TEXT,
    "platNom" TEXT,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT,
    "source" "SourceAvis" NOT NULL DEFAULT 'PARENT',
    "auteur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "detail" TEXT,
    "statut" "StatutSuggestion" NOT NULL DEFAULT 'NOUVELLE',
    "reponse" TEXT,
    "auteur" TEXT,
    "traitePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_ingredients" (
    "ingredientId" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteines" DECIMAL(7,2) NOT NULL,
    "glucides" DECIMAL(7,2) NOT NULL,
    "lipides" DECIMAL(7,2) NOT NULL,
    "fibres" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_ingredients_pkey" PRIMARY KEY ("ingredientId")
);

-- CreateTable
CREATE TABLE "equipements" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeEquipement" NOT NULL,
    "tempMin" DECIMAL(5,1) NOT NULL,
    "tempMax" DECIMAL(5,1) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releves_temperature" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "equipementId" TEXT NOT NULL,
    "valeur" DECIMAL(5,1) NOT NULL,
    "conforme" BOOLEAN NOT NULL,
    "mesureLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "par" TEXT,
    "action" TEXT,

    CONSTRAINT "releves_temperature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taches_hygiene" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "frequence" "FrequenceHygiene" NOT NULL DEFAULT 'QUOTIDIENNE',
    "zone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taches_hygiene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions_hygiene" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "tacheId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "faitPar" TEXT,
    "faitLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "executions_hygiene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformites" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "detail" TEXT,
    "gravite" "GraviteNC" NOT NULL DEFAULT 'MINEURE',
    "statut" "StatutNC" NOT NULL DEFAULT 'OUVERTE',
    "source" TEXT,
    "actionCorrective" TEXT,
    "creePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closLe" TIMESTAMP(3),

    CONSTRAINT "non_conformites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echantillons_temoins" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "platNom" TEXT NOT NULL,
    "conserveJusqu" DATE NOT NULL,
    "emplacement" TEXT,
    "preparePar" TEXT,
    "jete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "echantillons_temoins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectifs_kpi" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "kpi" TEXT NOT NULL,
    "cible" DECIMAL(14,2) NOT NULL,
    "sens" TEXT NOT NULL DEFAULT 'MIN',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectifs_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cles_api" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prefixe" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereUtilisation" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoqueeLe" TIMESTAMP(3),

    CONSTRAINT "cles_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regles_reappro" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "cible" DECIMAL(14,3) NOT NULL,
    "fournisseurId" TEXT,
    "delaiJours" INTEGER NOT NULL DEFAULT 2,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regles_reappro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferts" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "destId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "statut" "StatutTransfert" NOT NULL DEFAULT 'PREPARE',
    "note" TEXT,
    "creePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expediLe" TIMESTAMP(3),
    "recuLe" TIMESTAMP(3),

    CONSTRAINT "transferts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfert_lignes" (
    "id" TEXT NOT NULL,
    "transfertId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "ingredientNom" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "cout" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "transfert_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aides_etablissementId_nom_key" ON "aides"("etablissementId", "nom");

-- CreateIndex
CREATE INDEX "aides_inscrits_etablissementId_inscritId_idx" ON "aides_inscrits"("etablissementId", "inscritId");

-- CreateIndex
CREATE UNIQUE INDEX "aides_inscrits_inscritId_aideId_debut_key" ON "aides_inscrits"("inscritId", "aideId", "debut");

-- CreateIndex
CREATE INDEX "conges_etablissementId_statut_idx" ON "conges"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "conges_employeId_idx" ON "conges"("employeId");

-- CreateIndex
CREATE INDEX "pointages_etablissementId_date_idx" ON "pointages"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "pointages_employeId_date_key" ON "pointages"("employeId", "date");

-- CreateIndex
CREATE INDEX "certifications_rh_etablissementId_expireLe_idx" ON "certifications_rh"("etablissementId", "expireLe");

-- CreateIndex
CREATE INDEX "certifications_rh_employeId_idx" ON "certifications_rh"("employeId");

-- CreateIndex
CREATE INDEX "avis_etablissementId_date_idx" ON "avis"("etablissementId", "date");

-- CreateIndex
CREATE INDEX "suggestions_etablissementId_statut_idx" ON "suggestions"("etablissementId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "equipements_etablissementId_nom_key" ON "equipements"("etablissementId", "nom");

-- CreateIndex
CREATE INDEX "releves_temperature_equipementId_mesureLe_idx" ON "releves_temperature"("equipementId", "mesureLe");

-- CreateIndex
CREATE INDEX "releves_temperature_etablissementId_mesureLe_idx" ON "releves_temperature"("etablissementId", "mesureLe");

-- CreateIndex
CREATE UNIQUE INDEX "taches_hygiene_etablissementId_nom_key" ON "taches_hygiene"("etablissementId", "nom");

-- CreateIndex
CREATE INDEX "executions_hygiene_etablissementId_date_idx" ON "executions_hygiene"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "executions_hygiene_tacheId_date_key" ON "executions_hygiene"("tacheId", "date");

-- CreateIndex
CREATE INDEX "non_conformites_etablissementId_statut_idx" ON "non_conformites"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "echantillons_temoins_etablissementId_date_idx" ON "echantillons_temoins"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "objectifs_kpi_etablissementId_kpi_key" ON "objectifs_kpi"("etablissementId", "kpi");

-- CreateIndex
CREATE UNIQUE INDEX "cles_api_prefixe_key" ON "cles_api"("prefixe");

-- CreateIndex
CREATE INDEX "cles_api_etablissementId_idx" ON "cles_api"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "regles_reappro_etablissementId_ingredientId_key" ON "regles_reappro"("etablissementId", "ingredientId");

-- CreateIndex
CREATE INDEX "transferts_destId_statut_idx" ON "transferts"("destId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "transferts_sourceId_numero_key" ON "transferts"("sourceId", "numero");

-- CreateIndex
CREATE INDEX "transfert_lignes_transfertId_idx" ON "transfert_lignes"("transfertId");

-- AddForeignKey
ALTER TABLE "aides" ADD CONSTRAINT "aides_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aides_inscrits" ADD CONSTRAINT "aides_inscrits_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aides_inscrits" ADD CONSTRAINT "aides_inscrits_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aides_inscrits" ADD CONSTRAINT "aides_inscrits_aideId_fkey" FOREIGN KEY ("aideId") REFERENCES "aides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges" ADD CONSTRAINT "conges_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conges" ADD CONSTRAINT "conges_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointages" ADD CONSTRAINT "pointages_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointages" ADD CONSTRAINT "pointages_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications_rh" ADD CONSTRAINT "certifications_rh_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications_rh" ADD CONSTRAINT "certifications_rh_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes_rh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_ingredients" ADD CONSTRAINT "nutrition_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipements" ADD CONSTRAINT "equipements_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releves_temperature" ADD CONSTRAINT "releves_temperature_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releves_temperature" ADD CONSTRAINT "releves_temperature_equipementId_fkey" FOREIGN KEY ("equipementId") REFERENCES "equipements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taches_hygiene" ADD CONSTRAINT "taches_hygiene_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions_hygiene" ADD CONSTRAINT "executions_hygiene_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions_hygiene" ADD CONSTRAINT "executions_hygiene_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "taches_hygiene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformites" ADD CONSTRAINT "non_conformites_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echantillons_temoins" ADD CONSTRAINT "echantillons_temoins_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectifs_kpi" ADD CONSTRAINT "objectifs_kpi_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cles_api" ADD CONSTRAINT "cles_api_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regles_reappro" ADD CONSTRAINT "regles_reappro_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regles_reappro" ADD CONSTRAINT "regles_reappro_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts" ADD CONSTRAINT "transferts_destId_fkey" FOREIGN KEY ("destId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfert_lignes" ADD CONSTRAINT "transfert_lignes_transfertId_fkey" FOREIGN KEY ("transfertId") REFERENCES "transferts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
