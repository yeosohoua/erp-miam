-- CreateEnum
CREATE TYPE "TypeEvenement" AS ENUM ('VACANCES', 'FERIE', 'METEO', 'EVENEMENT');

-- CreateEnum
CREATE TYPE "TypeGaspillage" AS ENUM ('RESTE_ASSIETTE', 'INVENDU', 'PREPARE_EN_TROP');

-- CreateEnum
CREATE TYPE "StatutVente" AS ENUM ('PAYEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "evenements_cantine" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "type" "TypeEvenement" NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "impactPct" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_cantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_production" (
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "prevus" INTEGER NOT NULL,
    "aProduire" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_production_pkey" PRIMARY KEY ("etablissementId","date","service")
);

-- CreateTable
CREATE TABLE "gaspillages" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "platId" TEXT,
    "platNom" TEXT NOT NULL,
    "portions" INTEGER NOT NULL,
    "coutPortion" INTEGER NOT NULL,
    "cout" INTEGER NOT NULL,
    "type" "TypeGaspillage" NOT NULL,
    "note" TEXT,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gaspillages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles_carte" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prix" INTEGER NOT NULL,
    "categorie" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_carte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventes_comptoir" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "statut" "StatutVente" NOT NULL DEFAULT 'PAYEE',
    "methode" "MethodePaiement",
    "inscritId" TEXT,
    "visiteur" TEXT,
    "total" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,

    CONSTRAINT "ventes_comptoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vente_lignes" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "articleId" TEXT,
    "libelle" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "vente_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evenements_cantine_etablissementId_debut_fin_idx" ON "evenements_cantine"("etablissementId", "debut", "fin");

-- CreateIndex
CREATE INDEX "gaspillages_etablissementId_date_idx" ON "gaspillages"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "articles_carte_etablissementId_nom_key" ON "articles_carte"("etablissementId", "nom");

-- CreateIndex
CREATE INDEX "ventes_comptoir_etablissementId_createdAt_idx" ON "ventes_comptoir"("etablissementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ventes_comptoir_etablissementId_numero_key" ON "ventes_comptoir"("etablissementId", "numero");

-- CreateIndex
CREATE INDEX "vente_lignes_venteId_idx" ON "vente_lignes"("venteId");

-- AddForeignKey
ALTER TABLE "evenements_cantine" ADD CONSTRAINT "evenements_cantine_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_production" ADD CONSTRAINT "plans_production_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaspillages" ADD CONSTRAINT "gaspillages_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles_carte" ADD CONSTRAINT "articles_carte_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventes_comptoir" ADD CONSTRAINT "ventes_comptoir_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes_comptoir"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles_carte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
