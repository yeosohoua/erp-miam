/*
  Warnings:

  - A unique constraint covering the columns `[codeHash]` on the table `codes_acces` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "codes_acces_codeHash_key" ON "codes_acces"("codeHash");
