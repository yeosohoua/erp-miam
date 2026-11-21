import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesReappro } from "@/lib/reappro-acces"
import { propositionsReappro } from "@/lib/reappro"

import { basculerRegle, supprimerRegle } from "./actions"
import { FormGenerer, FormRegle, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { propositions: "Propositions de commande", regles: "Règles de réapprovisionnement" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2"
const qte = (n: number, u: string): string => Math.round(n * 1000) / 1000 + " " + u

function Kpi({ nom, titre, valeur }: { nom: string; titre: string; valeur: string }) {
  return (
    <div data-kpi={nom} className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="text-2xl font-semibold">{valeur}</p>
    </div>
  )
}

export async function ReapproView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesReappro()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, à l&apos;achat, au magasin et à la cuisine.
      </p>
    )
  }
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "propositions"
  return (
    <div className="flex flex-col gap-6" data-testid="reappro-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Réapprovisionnement automatique</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — commandes calculées d&apos;après vos stocks cibles</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="reappro-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/reappro?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "propositions" ? await Propositions({ etabId: etab.id, ecriture }) : null}
      {vue === "regles" ? await Regles({ etabId: etab.id, ecriture }) : null}
    </div>
  )
}

async function Propositions({ etabId, ecriture }: { etabId: string; ecriture: boolean }) {
  const props = await propositionsReappro(etabId)
  const sans = props.filter((p) => !p.fournisseurId).length
  const fournisseurs = new Set(props.map((p) => p.fournisseurId).filter((x) => x !== null)).size
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="prop-lignes" titre="Ingrédients à commander" valeur={String(props.length)} />
        <Kpi nom="prop-fournisseurs" titre="Fournisseurs concernés" valeur={String(fournisseurs)} />
        <Kpi nom="prop-sans-fournisseur" titre="Sans fournisseur défini" valeur={String(sans)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Quantités à commander</CardTitle>
          <CardDescription>Stock cible moins le stock actuel et moins les commandes déjà en cours. Les bons générés restent en brouillon : vous les validez dans les achats.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-propositions">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Ingrédient</th>
                <th className={th}>Stock</th>
                <th className={th}>En commande</th>
                <th className={th}>Cible</th>
                <th className={th}>À commander</th>
                <th className={th}>Fournisseur</th>
                <th className={th}>Délai</th>
              </tr>
            </thead>
            <tbody>
              {props.map((p) => (
                <tr key={p.regleId} data-proposition={p.nom} className="border-b last:border-0">
                  <td className={td}>{p.nom}</td>
                  <td className={td}>{qte(p.stock, p.unite)}</td>
                  <td className={td}>{qte(p.enCommande, p.unite)}</td>
                  <td className={td}>{qte(p.cible, p.unite)}</td>
                  <td className={td + " font-medium"}>{qte(p.aCommander, p.unite)}</td>
                  <td className={td}>{p.fournisseurNom ?? "Sans fournisseur"}</td>
                  <td className={td}>{p.delaiJours} j</td>
                </tr>
              ))}
              {props.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={7}>Rien à commander : tous les stocks atteignent leur cible.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {ecriture && props.length > 0 ? <FormGenerer /> : null}
          <p className="text-sm text-muted-foreground">
            Les bons en brouillon se trouvent dans <Link href="/achats" className="underline">les achats</Link>.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

async function Regles({ etabId, ecriture }: { etabId: string; ecriture: boolean }) {
  const [regles, ingredients, fournisseurs] = await Promise.all([
    db.regleReappro.findMany({ where: { etablissementId: etabId }, include: { ingredient: { select: { name: true, unit: true, stock: true } } } }),
    db.ingredient.findMany({ where: { etablissementId: etabId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fournisseur.findMany({ where: { etablissementId: etabId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  const nomF = new Map(fournisseurs.map((f) => [f.id, f.name]))
  const triees = [...regles].sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, "fr"))
  const optI: Option[] = ingredients.map((i) => ({ value: i.id, label: i.name }))
  const optF: Option[] = fournisseurs.map((f) => ({ value: f.id, label: f.name }))
  return (
    <>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Définir une règle</CardTitle>
            <CardDescription>Une règle existante pour le même ingrédient est remplacée.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormRegle ingredients={optI} fournisseurs={optF} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Règles de l&apos;établissement</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-regles">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Ingrédient</th>
                <th className={th}>Stock actuel</th>
                <th className={th}>Cible</th>
                <th className={th}>Fournisseur</th>
                <th className={th}>Délai</th>
                <th className={th}>État</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {triees.map((r) => (
                <tr key={r.id} data-regle={r.ingredient.name} className="border-b last:border-0">
                  <td className={td}>{r.ingredient.name}</td>
                  <td className={td}>{qte(Number(r.ingredient.stock), r.ingredient.unit)}</td>
                  <td className={td}>{qte(Number(r.cible), r.ingredient.unit)}</td>
                  <td className={td}>{(r.fournisseurId && nomF.get(r.fournisseurId)) || "Aucun"}</td>
                  <td className={td}>{r.delaiJours} j</td>
                  <td className={td}>{r.actif ? "Active" : "Désactivée"}</td>
                  <td className={td}>
                    {ecriture ? (
                      <div className="flex gap-2">
                        <form action={basculerRegle.bind(null, r.id)}>
                          <Button type="submit" variant="outline" size="sm">{r.actif ? "Désactiver" : "Réactiver"}</Button>
                        </form>
                        <form action={supprimerRegle.bind(null, r.id)}>
                          <Button type="submit" variant="outline" size="sm">Supprimer</Button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {triees.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={7}>Aucune règle définie.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}