-- CreateTable
CREATE TABLE "cartes_cadeaux" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creeeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utiliseeLe" TIMESTAMP(3),
    "inscritId" TEXT,

    CONSTRAINT "cartes_cadeaux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cartes_cadeaux_codeHash_key" ON "cartes_cadeaux"("codeHash");

-- CreateIndex
CREATE INDEX "cartes_cadeaux_etablissementId_statut_idx" ON "cartes_cadeaux"("etablissementId", "statut");

-- AddForeignKey
ALTER TABLE "cartes_cadeaux" ADD CONSTRAINT "cartes_cadeaux_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
