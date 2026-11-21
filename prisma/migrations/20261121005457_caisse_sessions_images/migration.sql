-- CreateEnum
CREATE TYPE "StatutSessionCaisse" AS ENUM ('OUVERTE', 'CLOTUREE');

-- AlterTable
ALTER TABLE "articles_carte" ADD COLUMN     "imageId" TEXT;

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "sessionCaisseObligatoire" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "imageId" TEXT;

-- AlterTable
ALTER TABLE "ventes_comptoir" ADD COLUMN     "recu" INTEGER,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "sessions_caisse" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "caissierEmail" TEXT NOT NULL,
    "statut" "StatutSessionCaisse" NOT NULL DEFAULT 'OUVERTE',
    "fondInitial" INTEGER NOT NULL,
    "ouverteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clotureeLe" TIMESTAMP(3),
    "clotureePar" TEXT,
    "especesAttendues" INTEGER,
    "especesComptees" INTEGER,
    "ecart" INTEGER,
    "noteCloture" TEXT,

    CONSTRAINT "sessions_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT,
    "mime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "donnees" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_caisse_etablissementId_statut_idx" ON "sessions_caisse"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "sessions_caisse_etablissementId_caissierEmail_statut_idx" ON "sessions_caisse"("etablissementId", "caissierEmail", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_caisse_etablissementId_numero_key" ON "sessions_caisse"("etablissementId", "numero");

-- CreateIndex
CREATE INDEX "images_etablissementId_idx" ON "images"("etablissementId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles_carte" ADD CONSTRAINT "articles_carte_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventes_comptoir" ADD CONSTRAINT "ventes_comptoir_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_caisse" ADD CONSTRAINT "sessions_caisse_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
