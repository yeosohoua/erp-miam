import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { analysePlat, arrondi, formaterMontant, formaterNombre } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { ajouterLigne, modifierPlat, retirerLigne, supprimerPlat } from "../../actions"
import { LigneForm } from "../../ligne-form"
import { OngletsMenus } from "../../onglets-menus"
import { PlatForm } from "../../plat-form"
import { PhotoForm } from "@/components/photo-form"
import { retirerImagePlat, televerserImagePlat } from "../../plat-image-actions"

export async function PlatDetail({ id }: { id: string }) {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  const { etab, ecriture, devise } = acces
  if (!etab) redirect("/menus/plats")

  // Filtre par l'etablissement actif : un identifiant d'un autre etablissement renvoie a la liste.
  const plat = await db.plat.findFirst({
    where: { id, etablissementId: etab.id },
    include: { ingredients: { orderBy: { ingredient: { name: "asc" } }, include: { ingredient: { include: { allergens: { include: { allergie: true } } } } } } },
  })
  if (!plat) redirect("/menus/plats")
  const a = analysePlat(plat)
  const ingredients = ecriture ? await db.ingredient.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }) : []

  return (
    <div className="flex flex-col gap-6">
      <OngletsMenus />
      <Link href="/menus/plats" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux plats
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Image du plat</CardTitle>
          <CardDescription>PNG, JPEG ou WebP : l&apos;image est réduite et affichée en entier, sans coupure.</CardDescription>
        </CardHeader>
        <CardContent>
          {ecriture ? (
            <PhotoForm imageId={plat.imageId} nom={plat.name} max={640} rond={false} televerser={televerserImagePlat.bind(null, id)} retirer={retirerImagePlat.bind(null, id)} />
          ) : plat.imageId ? (
            <div className="flex h-32 w-48 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              <img data-testid="photo-apercu" src={"/api/images/" + plat.imageId} alt={"Image de " + plat.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune image.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            {plat.name}
            <Badge variant={plat.active ? "secondary" : "outline"}>{plat.active ? "Actif" : "Désactivé"}</Badge>
          </CardTitle>
          <CardDescription>{plat.description ?? "Aucune description."}</CardDescription>
        </CardHeader>
        <CardContent>
          {ecriture ? (
            <PlatForm mode="edition" action={modifierPlat.bind(null, id)} valeurs={{ nom: plat.name, description: plat.description ?? "", portions: String(plat.portions), actif: plat.active }} />
          ) : (
            <p className="text-sm text-muted-foreground">Recette pour {plat.portions} portion(s).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recette</CardTitle>
          <CardDescription>Quantités pour {plat.portions} portion(s).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {plat.ingredients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun ingrédient.</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="lignes-recette">
              {plat.ingredients.map((l) => (
                <li key={l.ingredientId} data-ligne={l.ingredient.name} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0">
                  <div className="text-sm">
                    <p className="font-medium">{l.ingredient.name}</p>
                    <p className="text-muted-foreground">
                      {formaterNombre(Number(l.quantity))} {l.ingredient.unit} · {formaterMontant(Number(l.quantity) * Number(l.ingredient.unitCost), devise)}
                    </p>
                  </div>
                  {ecriture ? <BoutonAction action={retirerLigne.bind(null, id, l.ingredientId)} label="Retirer" /> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <p>
              Coût total de la recette : <span className="font-medium">{formaterMontant(a.cout, devise)}</span>
            </p>
            <p>
              Coût par portion : <span data-testid="cout-portion" data-cout={arrondi(a.coutPortion)} className="font-medium">{formaterMontant(a.coutPortion, devise)}</span>
            </p>
            <p data-testid="allergenes-plat">Allergènes : {a.allergenes.map((x) => x.name).join(", ") || "aucun"}</p>
          </div>
          {ecriture ? <LigneForm action={ajouterLigne.bind(null, id)} ingredients={ingredients} /> : null}
        </CardContent>
      </Card>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Suppression</CardTitle>
            <CardDescription>Impossible si le plat figure dans un menu : désactivez-le plutôt.</CardDescription>
          </CardHeader>
          <CardContent>
            <BoutonAction action={supprimerPlat.bind(null, id)} label="Supprimer le plat" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}