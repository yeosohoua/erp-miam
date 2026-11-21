import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { formaterMontant } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { creerIngredient } from "../actions"
import { IngredientForm } from "../ingredient-form"
import { OngletsMenus } from "../onglets-menus"

export async function IngredientsView() {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  const { etab, ecriture, devise } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const [ingredients, allergies] = await Promise.all([
    db.ingredient.findMany({
      where: { etablissementId: etab.id },
      orderBy: { name: "asc" },
      include: { allergens: { include: { allergie: true } }, _count: { select: { lignes: true } } },
    }),
    db.referentiel.findMany({ where: { etablissementId: etab.id, kind: "ALLERGIE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <OngletsMenus />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Ingrédients</h2>
        <p className="text-sm text-muted-foreground">Coût unitaire et allergènes, utilisés pour calculer les plats.</p>
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouvel ingrédient</CardTitle>
          </CardHeader>
          <CardContent>
            <IngredientForm mode="creation" action={creerIngredient} allergies={allergies} devise={devise} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Liste ({ingredients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div data-testid="liste-ingredients">
            {ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun ingrédient.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Ingrédient</th>
                    <th className="py-2 pr-4 font-medium">Coût unitaire</th>
                    <th className="py-2 pr-4 font-medium">Allergènes</th>
                    <th className="py-2 font-medium">Plats</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((i) => (
                    <tr key={i.id} data-ingredient={i.name} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={"/menus/ingredients/" + i.id} className="font-medium hover:underline">
                          {i.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {formaterMontant(Number(i.unitCost), devise)} / {i.unit}
                      </td>
                      <td className="py-2 pr-4">{i.allergens.map((a) => a.allergie.name).join(", ") || "—"}</td>
                      <td className="py-2">{i._count.lignes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}