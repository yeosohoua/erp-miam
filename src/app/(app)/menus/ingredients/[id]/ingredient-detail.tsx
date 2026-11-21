import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { formaterMontant } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { modifierIngredient, supprimerIngredient } from "../../actions"
import { IngredientForm } from "../../ingredient-form"
import { OngletsMenus } from "../../onglets-menus"

export async function IngredientDetail({ id }: { id: string }) {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  const { etab, ecriture, devise } = acces
  if (!etab) redirect("/menus/ingredients")

  const i = await db.ingredient.findFirst({
    where: { id, etablissementId: etab.id },
    include: { allergens: { include: { allergie: true } }, _count: { select: { lignes: true } } },
  })
  if (!i) redirect("/menus/ingredients")
  const allergies = ecriture ? await db.referentiel.findMany({ where: { etablissementId: etab.id, kind: "ALLERGIE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : []

  return (
    <div className="flex flex-col gap-6">
      <OngletsMenus />
      <Link href="/menus/ingredients" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux ingrédients
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{i.name}</CardTitle>
          <CardDescription>Utilisé dans {i._count.lignes} plat(s). Un changement de coût met à jour le coût de ces plats.</CardDescription>
        </CardHeader>
        <CardContent>
          {ecriture ? (
            <IngredientForm
              mode="edition"
              action={modifierIngredient.bind(null, id)}
              allergies={allergies}
              devise={devise}
              valeurs={{ nom: i.name, unite: i.unit, cout: String(Number(i.unitCost)), allergenes: i.allergens.map((a) => a.allergieId) }}
            />
          ) : (
            <p className="text-sm">
              {formaterMontant(Number(i.unitCost), devise)} / {i.unit} · Allergènes : {i.allergens.map((a) => a.allergie.name).join(", ") || "aucun"}
            </p>
          )}
        </CardContent>
      </Card>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Suppression</CardTitle>
            <CardDescription>Impossible si l&apos;ingrédient est utilisé dans un plat.</CardDescription>
          </CardHeader>
          <CardContent>
            <BoutonAction action={supprimerIngredient.bind(null, id)} label="Supprimer l'ingrédient" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}