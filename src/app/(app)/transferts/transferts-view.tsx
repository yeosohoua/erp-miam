import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { transfertAfficher } from "./affichage"
import { accesTransferts } from "@/lib/transfert-acces"
import { referenceTransfert } from "@/lib/transfert-base"

import { annulerTransfert, expedierTransfert, recevoirTransfert } from "./actions"
import { ActionTransfert, FormTransfert, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { sortants: "Transferts sortants", entrants: "Transferts entrants", nouveau: "Nouveau transfert" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2 align-top"
const jour = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "—")

export async function TransfertsView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesTransferts()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, à la cuisine et au magasin.
      </p>
    )
  }
  const { etab } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "sortants"
  return (
    <div className="flex flex-col gap-6" data-testid="transferts-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cuisine centrale et transferts</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — envois et réceptions de marchandises entre établissements</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="transferts-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/transferts?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "sortants" ? await Sortants({ etabId: etab.id }) : null}
      {vue === "entrants" ? await Entrants({ etabId: etab.id }) : null}
      {vue === "nouveau" ? await Nouveau({ etabId: etab.id }) : null}
    </div>
  )
}

async function Sortants({ etabId }: { etabId: string }) {
  const liste = await db.transfert.findMany({ where: { sourceId: etabId }, orderBy: { numero: "desc" }, take: 50, include: { lignes: true, dest: { select: { name: true } } } })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transferts sortants</CardTitle>
        <CardDescription>Le stock quitte votre établissement à l&apos;expédition (sortie par péremption la plus proche). Un transfert préparé peut encore être annulé.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-sortants">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={th}>N°</th>
              <th className={th}>Destination</th>
              <th className={th}>Contenu</th>
              <th className={th}>État</th>
              <th className={th}>Date</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((t) => (
              <tr key={t.id} data-transfert={String(t.numero)} data-statut={t.statut} className="border-b last:border-0">
                <td className={td}>{t.numero}</td>
                <td className={td}>{t.dest.name}</td>
                <td className={td}>{t.lignes.map((l) => Math.round(Number(l.quantite) * 1000) / 1000 + " " + l.unite + " " + l.ingredientNom).join(", ")}</td>
                <td className={td}>{transfertAfficher(t.statut)}</td>
                <td className={td}>{jour(t.expediLe ?? t.createdAt)}</td>
                <td className={td}>
                  {t.statut === "PREPARE" ? (
                    <div className="flex gap-2">
                      <ActionTransfert action={expedierTransfert.bind(null, t.id)} label="Expédier" />
                      <ActionTransfert action={annulerTransfert.bind(null, t.id)} label="Annuler" />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {liste.length === 0 ? (
              <tr>
                <td className={td + " text-muted-foreground"} colSpan={6}>Aucun transfert sortant.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

async function Entrants({ etabId }: { etabId: string }) {
  const liste = await db.transfert.findMany({ where: { destId: etabId, statut: { in: ["EXPEDIE", "RECU"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { lignes: true, source: { select: { code: true, name: true } } } })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transferts entrants</CardTitle>
        <CardDescription>Confirmez la réception pour ajouter la marchandise à votre stock, avec les dates de péremption d&apos;origine.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-entrants">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={th}>Référence</th>
              <th className={th}>Provenance</th>
              <th className={th}>Contenu</th>
              <th className={th}>État</th>
              <th className={th}>Expédié le</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((t) => (
              <tr key={t.id} data-entrant={referenceTransfert(t.source.code, t.numero)} data-statut={t.statut} className="border-b last:border-0">
                <td className={td}>{referenceTransfert(t.source.code, t.numero)}</td>
                <td className={td}>{t.source.name}</td>
                <td className={td}>{t.lignes.map((l) => Math.round(Number(l.quantite) * 1000) / 1000 + " " + l.unite + " " + l.ingredientNom).join(", ")}</td>
                <td className={td}>{transfertAfficher(t.statut)}</td>
                <td className={td}>{jour(t.expediLe)}</td>
                <td className={td}>{t.statut === "EXPEDIE" ? <ActionTransfert action={recevoirTransfert.bind(null, t.id)} label="Recevoir" /> : null}</td>
              </tr>
            ))}
            {liste.length === 0 ? (
              <tr>
                <td className={td + " text-muted-foreground"} colSpan={6}>Aucun transfert entrant.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

async function Nouveau({ etabId }: { etabId: string }) {
  const [etabs, ingredients] = await Promise.all([
    db.etablissement.findMany({ where: { active: true, id: { not: etabId } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.ingredient.findMany({ where: { etablissementId: etabId }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, stock: true } }),
  ])
  const dest: Option[] = etabs.map((e) => ({ value: e.id, label: e.name }))
  const ings: Option[] = ingredients.map((i) => ({ value: i.id, label: i.name + " (" + Math.round(Number(i.stock) * 1000) / 1000 + " " + i.unit + " en stock)" }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Préparer un transfert</CardTitle>
        <CardDescription>Jusqu&apos;à 5 ingrédients par transfert. Le stock ne bouge qu&apos;à l&apos;expédition.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormTransfert destinations={dest} ingredients={ings} />
      </CardContent>
    </Card>
  )
}