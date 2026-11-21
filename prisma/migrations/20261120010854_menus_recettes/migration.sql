-- CreateEnum
CREATE TYPE "MenuService" AS ENUM ('BREAKFAST', 'LUNCH', 'SNACK', 'DINNER');

-- CreateEnum
CREATE TYPE "MenuStatut" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_allergens" (
    "ingredientId" TEXT NOT NULL,
    "allergieId" TEXT NOT NULL,

    CONSTRAINT "ingredient_allergens_pkey" PRIMARY KEY ("ingredientId","allergieId")
);

-- CreateTable
CREATE TABLE "plats" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "portions" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ingredients" (
    "platId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "plat_ingredients_pkey" PRIMARY KEY ("platId","ingredientId")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "service" "MenuService" NOT NULL,
    "statut" "MenuStatut" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_plats" (
    "menuId" TEXT NOT NULL,
    "platId" TEXT NOT NULL,

    CONSTRAINT "menu_plats_pkey" PRIMARY KEY ("menuId","platId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_etablissementId_name_key" ON "ingredients"("etablissementId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "plats_etablissementId_name_key" ON "plats"("etablissementId", "name");

-- CreateIndex
CREATE INDEX "plat_ingredients_ingredientId_idx" ON "plat_ingredients"("ingredientId");

-- CreateIndex
CREATE INDEX "menus_etablissementId_date_idx" ON "menus"("etablissementId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "menus_etablissementId_date_service_key" ON "menus"("etablissementId", "date", "service");

-- CreateIndex
CREATE INDEX "menu_plats_platId_idx" ON "menu_plats"("platId");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergieId_fkey" FOREIGN KEY ("allergieId") REFERENCES "referentiels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plats" ADD CONSTRAINT "plats_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_ingredients" ADD CONSTRAINT "plat_ingredients_platId_fkey" FOREIGN KEY ("platId") REFERENCES "plats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_ingredients" ADD CONSTRAINT "plat_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_plats" ADD CONSTRAINT "menu_plats_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_plats" ADD CONSTRAINT "menu_plats_platId_fkey" FOREIGN KEY ("platId") REFERENCES "plats"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
