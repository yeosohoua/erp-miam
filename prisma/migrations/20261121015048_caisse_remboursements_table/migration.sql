-- CreateTable
CREATE TABLE "ventes_remboursements" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventes_remboursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ventes_remboursements_venteId_idx" ON "ventes_remboursements"("venteId");

-- CreateIndex
CREATE INDEX "ventes_remboursements_sessionId_idx" ON "ventes_remboursements"("sessionId");

-- CreateIndex
CREATE INDEX "ventes_remboursements_etablissementId_createdAt_idx" ON "ventes_remboursements"("etablissementId", "createdAt");

-- AddForeignKey
ALTER TABLE "ventes_remboursements" ADD CONSTRAINT "ventes_remboursements_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes_comptoir"("id") ON DELETE CASCADE ON UPDATE CASCADE;
