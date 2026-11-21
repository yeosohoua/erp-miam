-- CreateEnum
CREATE TYPE "ReservationStatut" AS ENUM ('BOOKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "inscritId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "statut" "ReservationStatut" NOT NULL DEFAULT 'BOOKED',
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_etablissementId_date_service_idx" ON "reservations"("etablissementId", "date", "service");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_inscritId_date_service_key" ON "reservations"("inscritId", "date", "service");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_inscritId_fkey" FOREIGN KEY ("inscritId") REFERENCES "inscrits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
