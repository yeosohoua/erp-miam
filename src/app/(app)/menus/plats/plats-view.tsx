import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { analysePlat, arrondi, formaterMontant } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { creerPlat } from "../actions"
import { OngletsMenus } from "../onglets-menus"
import { PlatForm } from "../plat-form"

export async function PlatsView() {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  const { etab, ecriture, devise } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const plats = await db.plat.findMany({
    where: { etablissementId: etab.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { ingredients: { include: { ingredient: { include: { allergens: { include: { allergie: true } } } } } } },
  })

  return (
    <div className="flex flex-col gap-6">
      <OngletsMenus />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Plats et recettes</h2>
        <p className="text-sm text-muted-foreground">Le coût par portion est calculé à partir des ingrédients de la recette.</p>
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau plat</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatForm mode="creation" action={creerPlat} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Liste ({plats.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div data-testid="liste-plats">
            {plats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun plat.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-16 py-2 pr-2" />
                    <th className="py-2 pr-4 font-medium">Plat</th>
                    <th className="py-2 pr-4 font-medium">Portions</th>
                    <th className="py-2 pr-4 font-medium">Coût / portion</th>
                    <th className="py-2 pr-4 font-medium">Allergènes</th>
                    <th className="py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {plats.map((p) => {
                    const a = analysePlat(p)
                    return (
                      <tr key={p.id} data-plat={p.name} className="border-b last:border-0">
                        <td className="w-16 py-2 pr-2">{p.imageId ? <div className="flex h-10 w-14 items-center justify-center overflow-hidden rounded-md bg-muted"><img src={"/api/images/" + p.imageId} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /></div> : null}</td>
                        <td className="py-2 pr-4">
                          <Link href={"/menus/plats/" + p.id} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{p.portions}</td>
                        <td className="py-2 pr-4" data-cout={arrondi(a.coutPortion)}>
                          {formaterMontant(a.coutPortion, devise)}
                        </td>
                        <td className="py-2 pr-4">{a.allergenes.map((x) => x.name).join(", ") || "—"}</td>
                        <td className="py-2">
                          <Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "Actif" : "Désactivé"}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}