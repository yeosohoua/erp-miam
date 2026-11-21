import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { SERVICES, analysePlat, arrondi, dateValide, formaterMontant, libelleJour, lundiDe, serviceValide, versDate } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { ajouterPlatMenu, basculerPublication, retirerPlatMenu, supprimerMenu } from "../../../actions"
import { AjoutPlatMenuForm } from "../../../ajout-plat-menu-form"
import { OngletsMenus } from "../../../onglets-menus"
import { PhotoForm } from "@/components/photo-form"
import { retirerImageMenu, televerserImageMenu } from "../../../menu-image-actions"

export async function MenuJour({ date, service }: { date: string; service: string }) {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  if (!dateValide(date) || !serviceValide(service)) redirect("/menus")
  const { etab, ecriture, devise } = acces
  if (!etab) redirect("/menus")

  const menu = await db.menu.findUnique({
    where: { etablissementId_date_service: { etablissementId: etab.id, date: versDate(date), service } },
    include: {
      plats: { include: { plat: { include: { ingredients: { include: { ingredient: { include: { allergens: { include: { allergie: true } } } } } } } } } },
    },
  })

  const analyses = (menu?.plats ?? []).map((mp) => ({ plat: mp.plat, ...analysePlat(mp.plat) })).sort((a, b) => a.plat.name.localeCompare(b.plat.name, "fr"))
  const coutConvive = analyses.reduce((s, a) => s + a.coutPortion, 0)
  const allergenes = new Map<string, string>()
  for (const a of analyses) for (const x of a.allergenes) allergenes.set(x.id, x.name)
  const ids = [...allergenes.keys()]
  const concernes = ids.length
    ? await db.inscritAllergie.groupBy({
        by: ["allergieId"],
        where: { allergieId: { in: ids }, inscrit: { etablissementId: etab.id, statut: "ACTIVE" } },
        _count: { _all: true },
      })
    : []
  const nombre = new Map(concernes.map((c) => [c.allergieId, c._count._all]))

  const publie = menu?.statut === "PUBLISHED"
  const modifiable = ecriture && !publie
  const dejaDans = new Set((menu?.plats ?? []).map((p) => p.platId))
  const disponibles = modifiable ? (await db.plat.findMany({ where: { etablissementId: etab.id, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).filter((p) => !dejaDans.has(p.id)) : []

  return (
    <div className="flex flex-col gap-6" data-testid="menu-jour" data-statut={menu?.statut ?? "NONE"}>
      <OngletsMenus />
      <Link href={"/menus?semaine=" + lundiDe(date)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour au planning
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {SERVICES[service]} — <span className="capitalize">{libelleJour(date)}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{etab.name}</p>
      </div>

{menu ? (
        <Card data-testid="image-menu">
          <CardHeader>
            <CardTitle>Image du menu</CardTitle>
            <CardDescription>PNG, JPEG ou WebP : l&apos;image est réduite et affichée en entier, sans coupure.</CardDescription>
          </CardHeader>
          <CardContent>
            {ecriture ? (
              <PhotoForm imageId={menu.imageId} nom={"Menu " + date} max={640} rond={false} televerser={televerserImageMenu.bind(null, date, service)} retirer={retirerImageMenu.bind(null, date, service)} />
            ) : menu.imageId ? (
              <div className="flex h-32 w-48 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                <img data-testid="photo-apercu" src={"/api/images/" + menu.imageId} alt="Image du menu" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune image.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Plats du menu
            {menu ? <Badge variant={publie ? "secondary" : "outline"}>{publie ? "Publié" : "Brouillon"}</Badge> : <Badge variant="outline">Aucun menu</Badge>}
          </CardTitle>
          {publie ? <CardDescription>Menu publié : dépubliez-le pour le modifier.</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun plat pour ce créneau.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {analyses.map((a) => (
                <li key={a.plat.id} data-plat={a.plat.name} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0">
                  <div className="text-sm">
                    <p className="font-medium">{a.plat.name}</p>
                    <p className="text-muted-foreground">
                      {formaterMontant(a.coutPortion, devise)} par portion
                      {a.allergenes.length > 0 ? " · Allergènes : " + a.allergenes.map((x) => x.name).join(", ") : ""}
                    </p>
                  </div>
                  {modifiable ? <BoutonAction action={retirerPlatMenu.bind(null, date, service, a.plat.id)} label="Retirer" /> : null}
                </li>
              ))}
            </ul>
          )}
          {analyses.length > 0 ? (
            <p className="text-sm">
              Coût par convive : <span data-testid="cout-convive" data-cout={arrondi(coutConvive)} className="font-medium">{formaterMontant(coutConvive, devise)}</span>
            </p>
          ) : null}
          {modifiable ? <AjoutPlatMenuForm action={ajouterPlatMenu.bind(null, date, service)} plats={disponibles} /> : null}
        </CardContent>
      </Card>

      {allergenes.size > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Allergènes présents</CardTitle>
            <CardDescription>Inscrits actifs de l&apos;établissement concernés par chaque allergène.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm" data-testid="allergenes-menu">
              {[...allergenes].map(([id, name]) => (
                <li key={id} data-allergene={name}>
                  <span className="font-medium">{name}</span> — {nombre.get(id) ?? 0} inscrit(s) concerné(s)
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {ecriture && menu ? (
        <Card>
          <CardHeader>
            <CardTitle>Publication</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-4">
            <BoutonAction action={basculerPublication.bind(null, date, service)} label={publie ? "Dépublier le menu" : "Publier le menu"} variant={publie ? "outline" : "outline"} />
            {!publie ? <BoutonAction action={supprimerMenu.bind(null, date, service)} label="Supprimer le menu" variant="ghost" /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}