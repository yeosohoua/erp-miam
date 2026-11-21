-- CreateTable
CREATE TABLE "configuration" (
    "cle" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "configuration_pkey" PRIMARY KEY ("cle")
);
