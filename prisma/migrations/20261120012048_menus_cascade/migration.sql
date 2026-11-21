-- DropForeignKey
ALTER TABLE "menu_plats" DROP CONSTRAINT "menu_plats_platId_fkey";

-- DropForeignKey
ALTER TABLE "plat_ingredients" DROP CONSTRAINT "plat_ingredients_ingredientId_fkey";

-- AddForeignKey
ALTER TABLE "plat_ingredients" ADD CONSTRAINT "plat_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_plats" ADD CONSTRAINT "menu_plats_platId_fkey" FOREIGN KEY ("platId") REFERENCES "plats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
