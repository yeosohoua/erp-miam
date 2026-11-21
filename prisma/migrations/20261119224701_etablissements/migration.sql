-- CreateEnum
CREATE TYPE "EtablissementType" AS ENUM ('SCHOOL', 'COMPANY', 'OTHER');

-- CreateTable
CREATE TABLE "etablissements" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EtablissementType" NOT NULL DEFAULT 'SCHOOL',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etablissements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_etablissements" (
    "userId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_etablissements_pkey" PRIMARY KEY ("userId","etablissementId")
);

-- CreateIndex
CREATE UNIQUE INDEX "etablissements_code_key" ON "etablissements"("code");

-- CreateIndex
CREATE INDEX "user_etablissements_etablissementId_idx" ON "user_etablissements"("etablissementId");

-- AddForeignKey
ALTER TABLE "user_etablissements" ADD CONSTRAINT "user_etablissements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_etablissements" ADD CONSTRAINT "user_etablissements_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
