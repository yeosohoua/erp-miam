-- CreateEnum
CREATE TYPE "JournalCompta" AS ENUM ('VE', 'AC', 'CA', 'BQ', 'OD');

-- CreateTable
CREATE TABLE "ecritures_compta" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "journal" "JournalCompta" NOT NULL,
    "date" DATE NOT NULL,
    "piece" TEXT,
    "libelle" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecritures_compta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecriture_lignes" (
    "id" TEXT NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "compte" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ecriture_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clotures_compta" (
    "etablissementId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "clotureLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clotureePar" TEXT,

    CONSTRAINT "clotures_compta_pkey" PRIMARY KEY ("etablissementId","periode")
);

-- CreateIndex
CREATE INDEX "ecritures_compta_etablissementId_date_idx" ON "ecritures_compta"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ecritures_compta_etablissementId_numero_key" ON "ecritures_compta"("etablissementId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ecritures_compta_etablissementId_sourceType_sourceId_key" ON "ecritures_compta"("etablissementId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ecriture_lignes_ecritureId_idx" ON "ecriture_lignes"("ecritureId");

-- CreateIndex
CREATE INDEX "ecriture_lignes_compte_idx" ON "ecriture_lignes"("compte");

-- AddForeignKey
ALTER TABLE "ecritures_compta" ADD CONSTRAINT "ecritures_compta_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecriture_lignes" ADD CONSTRAINT "ecriture_lignes_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures_compta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clotures_compta" ADD CONSTRAINT "clotures_compta_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
