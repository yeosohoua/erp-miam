-- CreateTable
CREATE TABLE "commandes_mobile" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inscritId" TEXT,
    "total" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "paiement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commandes_mobile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commandes_mobile_lignes" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "articleId" TEXT,
    "nom" TEXT NOT NULL,
    "prix" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "menuDate" TEXT,
    "service" TEXT,

    CONSTRAINT "commandes_mobile_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commandes_mobile_userId_createdAt_idx" ON "commandes_mobile"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "commandes_mobile_etablissementId_statut_idx" ON "commandes_mobile"("etablissementId", "statut");

-- CreateIndex
CREATE INDEX "commandes_mobile_lignes_commandeId_idx" ON "commandes_mobile_lignes"("commandeId");

-- AddForeignKey
ALTER TABLE "commandes_mobile" ADD CONSTRAINT "commandes_mobile_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commandes_mobile_lignes" ADD CONSTRAINT "commandes_mobile_lignes_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes_mobile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
