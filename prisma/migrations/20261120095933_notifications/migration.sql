-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "parametres_notification" (
    "etablissementId" TEXT NOT NULL,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "relances" BOOLEAN NOT NULL DEFAULT true,
    "recharges" BOOLEAN NOT NULL DEFAULT true,
    "soldeBas" BOOLEAN NOT NULL DEFAULT true,
    "seuilSoldeBas" INTEGER NOT NULL DEFAULT 1000,
    "repasServi" BOOLEAN NOT NULL DEFAULT false,
    "alertesStock" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "parametres_notification_pkey" PRIMARY KEY ("etablissementId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "destinataire" TEXT NOT NULL,
    "sujet" TEXT,
    "message" TEXT NOT NULL,
    "evenement" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "statut" "StatutNotification" NOT NULL DEFAULT 'PENDING',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyeLe" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_etablissementId_createdAt_idx" ON "notifications"("etablissementId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_statut_idx" ON "notifications"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_etablissementId_cle_key" ON "notifications"("etablissementId", "cle");

-- AddForeignKey
ALTER TABLE "parametres_notification" ADD CONSTRAINT "parametres_notification_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
