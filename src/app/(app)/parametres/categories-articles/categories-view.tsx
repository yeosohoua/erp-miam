import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesCaisse } from "@/lib/caisse-acces"
import { db } from "@/lib/db"

import { ajouterCategorie, basculerCategorie, modifierCategorie, semerCategories, supprimerCategorie } from "./actions"
import { AjoutForm, LigneCategorie, SemerForm } from "./formulaires"

export async function CategoriesView() {
  const a = await accesCaisse()
  if (!a || !a.config) redirect("/")
  const etab = a.etab
  const categories = etab ? await db.categorieArticle.findMany({ where: { etablissementId: etab.id }, orderBy: [{ ordre: "asc" }, { nom: "asc" }] }) : []
  const articles = etab ? await db.articleCarte.findMany({ where: { etablissementId: etab.id, categorie: { not: null } }, select: { categorie: true } }) : []
  const compte = new Map<string, number>()
  for (const x of articles) if (x.categorie) compte.set(x.categorie, (compte.get(x.categorie) ?? 0) + 1)

  return (
    <div className="flex flex-col gap-6" data-testid="categories-articles-page">
      <div>
        <Link href="/parametres" className="text-sm text-muted-foreground hover:underline">
          ← Paramètres
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Catégories d&apos;articles</h2>
        <p className="text-sm text-muted-foreground">
          Ces catégories s&apos;affichent dans l&apos;application mobile. Un article est rattaché à une catégorie par le nom indiqué dans sa fiche de la caisse.
        </p>
      </div>
      {!etab ? (
        <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{etab.name}</CardTitle>
            <CardDescription>{categories.length} catégorie(s)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AjoutForm action={ajouterCategorie} />
            {categories.length === 0 ? <SemerForm action={semerCategories} /> : null}
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <LigneCategorie
                  key={c.id}
                  id={c.id}
                  nom={c.nom}
                  ordre={c.ordre}
                  active={c.active}
                  articles={compte.get(c.nom) ?? 0}
                  modifier={modifierCategorie.bind(null, c.id)}
                  basculer={basculerCategorie.bind(null, c.id)}
                  supprimer={supprimerCategorie.bind(null, c.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}