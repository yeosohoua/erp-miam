import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesStock } from "@/lib/approvisionnement-acces"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, formaterMontant, formaterNombre, versIso } from "@/lib/menus"
import { JOURS_ALERTE, TYPES_MOUVEMENT, type TypeMouvement } from "@/lib/stock-base"

import { ajusterStock, decompter, definirSeuil, rebuterLot } from "./actions"
import { AjustementStockForm, ConsommationForm, SeuilForm } from "./formulaires"

function Stat({ titre, valeur, brut, testid, note }: { titre: string; valeur: string; brut: number; testid: string; note: string }) {
  return (
    <Card data-testid={testid} data-valeur={brut}>
      <CardHeader className="pb-2">
        <CardDescription>{titre}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valeur}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  )
}

export async function StockView() {
  const acces = await accesStock()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>
  const jour = aujourdhui()
  const limite = ajouterJours(jour, JOURS_ALERTE)

  const [info, ingredients, lots, mouvements] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }),
    db.ingredient.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, stock: true, seuil: true } }),
    db.lot.findMany({
      where: { etablissementId: etab.id, restante: { gt: 0 } },
      orderBy: [{ peremption: { sort: "asc", nulls: "last" } }, { recuLe: "asc" }],
      include: { ingredient: { select: { name: true, unit: true } } },
    }),
    db.mouvementStock.findMany({ where: { etablissementId: etab.id }, orderBy: { createdAt: "desc" }, take: 30, include: { ingredient: { select: { name: true, unit: true } } } }),
  ])
  const devise = info?.currency ?? "XOF"
  const etatLot = (p: Date | null): "perime" | "bientot" | "ok" => {
    if (!p) return "ok"
    const iso = versIso(p)
    return iso < jour ? "perime" : iso <= limite ? "bientot" : "ok"
  }
  const valeur = lots.reduce((s, l) => s + Number(l.restante) * Number(l.prix), 0)
  const sousSeuil = ingredients.filter((i) => Number(i.seuil) > 0 && Number(i.stock) <= Number(i.seuil)).length
  const perimes = lots.filter((l) => etatLot(l.peremption) === "perime").length
  const bientot = lots.filter((l) => etatLot(l.peremption) === "bientot").length
  const statutIng = (stock: number, seuil: number) => (stock <= 0 ? "rupture" : seuil > 0 && stock <= seuil ? "bas" : "ok")
  const liste = ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))

  return (
    <div className="flex flex-col gap-6" data-testid="stock-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Stock</h2>
          <p className="text-sm text-muted-foreground">Niveaux, lots et mouvements — {etab.name}</p>
        </div>
        <Link href="/achats" className="text-sm text-muted-foreground hover:underline">
          Achats →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat titre="Valeur du stock" valeur={formaterMontant(valeur, devise)} brut={Math.round(valeur)} testid="kpi-valeur" note="Quantités restantes × prix d'achat" />
        <Stat titre="Sous le seuil" valeur={String(sousSeuil)} brut={sousSeuil} testid="kpi-sous-seuil" note="Ingrédients à réapprovisionner" />
        <Stat titre="Lots périmés" valeur={String(perimes)} brut={perimes} testid="kpi-perimes" note="À rebuter" />
        <Stat titre={"Péremption sous " + JOURS_ALERTE + " j"} valeur={String(bientot)} brut={bientot} testid="kpi-bientot" note="À consommer en priorité" />
      </div>

      {ecriture ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Seuil d&apos;alerte</CardTitle>
            </CardHeader>
            <CardContent>
              <SeuilForm action={definirSeuil} ingredients={liste} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Inventaire et pertes</CardTitle>
              <CardDescription>L&apos;inventaire aligne le stock sur la quantité comptée ; la perte retire la quantité cassée ou gaspillée.</CardDescription>
            </CardHeader>
            <CardContent>
              <AjustementStockForm action={ajusterStock} ingredients={liste} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consommation</CardTitle>
              <CardDescription>Retire du stock les ingrédients du menu publié, selon les repas servis (une seule fois par créneau).</CardDescription>
            </CardHeader>
            <CardContent>
              <ConsommationForm action={decompter} defaut={jour} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Niveaux de stock</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="stock-table">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Ingrédient</th>
                <th className="py-2 pr-4 text-right font-medium">Stock</th>
                <th className="py-2 pr-4 text-right font-medium">Seuil</th>
                <th className="py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => {
                const st = Number(i.stock)
                const se = Number(i.seuil)
                const s = statutIng(st, se)
                return (
                  <tr key={i.id} data-ingredient={i.name} data-stock={st} data-seuil={se} data-statut={s} className="border-b last:border-0">
                    <td className="py-2 pr-4">{i.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formaterNombre(st)} {i.unit}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{se > 0 ? formaterNombre(se) : "—"}</td>
                    <td className={"py-2 " + (s === "ok" ? "text-muted-foreground" : "text-destructive")}>{s === "rupture" ? "Rupture" : s === "bas" ? "Stock bas" : "Correct"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {ingredients.length === 0 ? <p className="text-sm text-muted-foreground">Aucun ingrédient. Créez-les dans Menus &gt; Ingrédients.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lots en stock</CardTitle>
          <CardDescription>Les lots qui périment en premier sont consommés en premier.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="lots">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Lot</th>
                <th className="py-2 pr-4 font-medium">Ingrédient</th>
                <th className="py-2 pr-4 text-right font-medium">Restant</th>
                <th className="py-2 pr-4 font-medium">Péremption</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const e = etatLot(l.peremption)
                return (
                  <tr key={l.id} data-lot-ref={l.reference} data-restante={Number(l.restante)} data-etat={e} className="border-b align-top last:border-0">
                    <td className="py-2 pr-4">{l.reference}</td>
                    <td className="py-2 pr-4">{l.ingredient.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formaterNombre(Number(l.restante))} {l.ingredient.unit}
                    </td>
                    <td className={"py-2 pr-4 " + (e === "ok" ? "text-muted-foreground" : "text-destructive")}>
                      {l.peremption ? versIso(l.peremption) : "—"}
                      {e === "perime" ? " (périmé)" : e === "bientot" ? " (bientôt)" : ""}
                    </td>
                    <td className="py-2 text-right">{ecriture ? <BoutonAction action={rebuterLot.bind(null, l.id)} label="Rebuter" variant="ghost" /> : null}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {lots.length === 0 ? <p className="text-sm text-muted-foreground">Aucun lot en stock.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Derniers mouvements</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="mouvements">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Ingrédient</th>
                <th className="py-2 pr-4 text-right font-medium">Quantité</th>
                <th className="py-2 font-medium">Détail</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map((m) => (
                <tr key={m.id} data-type={m.type} data-quantite={Number(m.quantite)} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{versIso(m.createdAt)}</td>
                  <td className="py-2 pr-4">{TYPES_MOUVEMENT[m.type as TypeMouvement]}</td>
                  <td className="py-2 pr-4">{m.ingredient.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {Number(m.quantite) > 0 ? "+" : ""}
                    {formaterNombre(Number(m.quantite))} {m.ingredient.unit}
                  </td>
                  <td className="py-2 text-muted-foreground">{m.note ?? m.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mouvements.length === 0 ? <p className="text-sm text-muted-foreground">Aucun mouvement.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}