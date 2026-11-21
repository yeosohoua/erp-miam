import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, dateValide, lundiDe, serviceValide } from "@/lib/menus"
import { evaluerRepas } from "@/lib/nutrition-base"
import { accesNutrition } from "@/lib/nutrition-acces"
import { chargerPlats } from "@/lib/nutrition"
import { calculerPropositions } from "@/lib/nutrition-propositions"

import { retirerValeurs } from "./actions"
import { FormBrouillons, FormImport, FormValeurs, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { plats: "Plats", ingredients: "Valeurs des ingrédients", menus: "Menus intelligents" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const liste = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : [])
const fr = (iso: string): string => iso.split("-").reverse().join("/")
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2"
const champ = "h-9 rounded-md border bg-background px-3 text-sm"
const SERVICES: Record<string, string> = { BREAKFAST: "Petit-déjeuner", LUNCH: "Déjeuner", SNACK: "Goûter", DINNER: "Dîner" }

function Kpi({ nom, titre, valeur }: { nom: string; titre: string; valeur: string }) {
  return (
    <div data-kpi={nom} className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="text-2xl font-semibold">{valeur}</p>
    </div>
  )
}

export async function NutritionView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesNutrition()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, à la cuisine et au magasin.
      </p>
    )
  }
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "plats"
  return (
    <div className="flex flex-col gap-6" data-testid="nutrition-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Nutrition et menus intelligents</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — équilibre des repas et propositions de menus</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="nutrition-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/nutrition?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "plats" ? await Plats({ etabId: etab.id }) : null}
      {vue === "ingredients" ? await Ingredients({ etabId: etab.id, ecriture }) : null}
      {vue === "menus" ? await Menus({ etabId: etab.id, ecriture, sp }) : null}
    </div>
  )
}

async function Plats({ etabId }: { etabId: string }) {
  const plats = await chargerPlats(etabId)
  const complets = plats.filter((p) => p.nbLignes > 0 && p.manquants === 0)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="plats-total" titre="Plats actifs" valeur={String(plats.length)} />
        <Kpi nom="plats-complets" titre="Plats avec valeurs complètes" valeur={String(complets.length)} />
        <Kpi nom="plats-incomplets" titre="Plats à compléter" valeur={String(plats.length - complets.length)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Valeurs par portion</CardTitle>
          <CardDescription>Calculées à partir des recettes et des valeurs des ingrédients. Le score évalue l&apos;équilibre d&apos;un déjeuner.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-plats">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Plat</th>
                <th className={th}>kcal</th>
                <th className={th}>Protéines</th>
                <th className={th}>Glucides</th>
                <th className={th}>Lipides</th>
                <th className={th}>Fibres</th>
                <th className={th}>Score</th>
                <th className={th}>Remarques</th>
              </tr>
            </thead>
            <tbody>
              {plats.map((p) => {
                const complet = p.nbLignes > 0 && p.manquants === 0
                const ev = complet ? evaluerRepas("LUNCH", p.parPortion) : null
                return (
                  <tr key={p.id} data-plat={p.nom} className="border-b last:border-0">
                    <td className={td}>{p.nom}</td>
                    <td className={td}>{complet ? p.parPortion.kcal : "—"}</td>
                    <td className={td}>{complet ? p.parPortion.proteines + " g" : "—"}</td>
                    <td className={td}>{complet ? p.parPortion.glucides + " g" : "—"}</td>
                    <td className={td}>{complet ? p.parPortion.lipides + " g" : "—"}</td>
                    <td className={td}>{complet ? p.parPortion.fibres + " g" : "—"}</td>
                    <td className={td}>{ev ? ev.score + " / 100" : "—"}</td>
                    <td className={td + " text-muted-foreground"}>
                      {!complet ? (p.nbLignes === 0 ? "Aucune recette" : "Incomplet : " + p.manquants + " ingrédient(s) sans valeurs") : ev && ev.alertes.length > 0 ? ev.alertes.join(" ") : "Équilibré"}
                    </td>
                  </tr>
                )
              })}
              {plats.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={8}>Aucun plat actif.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Ingredients({ etabId, ecriture }: { etabId: string; ecriture: boolean }) {
  const ings = await db.ingredient.findMany({ where: { etablissementId: etabId }, orderBy: { name: "asc" }, include: { nutrition: true } })
  const renseignes = ings.filter((i) => i.nutrition).length
  const options: Option[] = ings.map((i) => ({ value: i.id, label: i.name }))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="ing-total" titre="Ingrédients" valeur={String(ings.length)} />
        <Kpi nom="ing-renseignes" titre="Avec valeurs nutritionnelles" valeur={String(renseignes)} />
        <Kpi nom="ing-manquants" titre="Sans valeurs" valeur={String(ings.length - renseignes)} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Renseigner un ingrédient</CardTitle>
            <CardDescription>Valeurs pour 100 g (ou 100 ml) de produit. L&apos;import remplit seulement les ingrédients encore vides.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormImport />
            <FormValeurs ingredients={options} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Valeurs pour 100 g</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-ingredients">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Ingrédient</th>
                <th className={th}>kcal</th>
                <th className={th}>Protéines</th>
                <th className={th}>Glucides</th>
                <th className={th}>Lipides</th>
                <th className={th}>Fibres</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {ings.map((i) => (
                <tr key={i.id} data-ingredient={i.name} className="border-b last:border-0">
                  <td className={td}>{i.name}</td>
                  <td className={td}>{i.nutrition ? i.nutrition.kcal : "Non renseigné"}</td>
                  <td className={td}>{i.nutrition ? Number(i.nutrition.proteines) + " g" : "—"}</td>
                  <td className={td}>{i.nutrition ? Number(i.nutrition.glucides) + " g" : "—"}</td>
                  <td className={td}>{i.nutrition ? Number(i.nutrition.lipides) + " g" : "—"}</td>
                  <td className={td}>{i.nutrition ? Number(i.nutrition.fibres) + " g" : "—"}</td>
                  <td className={td}>
                    {ecriture && i.nutrition ? (
                      <form action={retirerValeurs.bind(null, i.id)}>
                        <Button type="submit" variant="outline" size="sm">Retirer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Menus({ etabId, ecriture, sp }: { etabId: string; ecriture: boolean; sp: SP }) {
  const serviceDemande = un(sp.service)
  const service = serviceValide(serviceDemande) ? serviceDemande : "LUNCH"
  const debutDemande = un(sp.debut)
  const debut = lundiDe(dateValide(debutDemande) ? debutDemande : ajouterJours(aujourdhui(), 7))
  const budgetTxt = un(sp.budget).trim()
  const budgetNb = budgetTxt !== "" && Number.isFinite(Number(budgetTxt.replace(",", "."))) ? Number(budgetTxt.replace(",", ".")) : null
  const exclus = liste(sp.exclus)
  const plats = await chargerPlats(etabId)
  const allergenes = Array.from(new Set(plats.flatMap((p) => p.allergenes))).sort()
  const propose = un(sp.propose) === "1"
  const props = propose ? await calculerPropositions(etabId, { service, debut, budget: budgetNb, exclus }) : []
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Proposer une semaine de menus</CardTitle>
          <CardDescription>Équilibre nutritionnel, budget par portion, variété et ingrédients à consommer en priorité (péremption sous sept jours). Les dimanches sont exclus.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" action="/nutrition" data-testid="form-propositions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="vue" value="menus" />
            <input type="hidden" name="propose" value="1" />
            <label className="flex flex-col gap-1 text-sm">
              Service
              <select id="pr-service" name="service" defaultValue={service} className={champ}>
                {Object.entries(SERVICES).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Semaine du
              <input id="pr-debut" name="debut" type="date" defaultValue={debut} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Budget maximum par portion
              <input id="pr-budget" name="budget" inputMode="decimal" defaultValue={budgetTxt} className={champ} />
            </label>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend>Exclure les allergènes</legend>
              <div className="flex flex-wrap gap-3">
                {allergenes.map((a) => (
                  <label key={a} className="flex items-center gap-1">
                    <input type="checkbox" name="exclus" value={a} defaultChecked={exclus.includes(a)} />
                    {a}
                  </label>
                ))}
                {allergenes.length === 0 ? <span className="text-muted-foreground">Aucun allergène déclaré.</span> : null}
              </div>
            </fieldset>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Proposer des menus</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {propose ? (
        <Card>
          <CardHeader>
            <CardTitle>Propositions — {SERVICES[service]}, semaine du {fr(debut)}</CardTitle>
            <CardDescription>Seuls les plats dont tous les ingrédients ont des valeurs nutritionnelles sont proposés.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {props.length === 0 ? (
              <p data-testid="aucune-proposition" className="text-sm text-muted-foreground">Aucune proposition possible avec ces critères.</p>
            ) : (
              <table className="w-full text-sm" data-testid="propositions">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className={th}>Jour</th>
                    <th className={th}>Plat</th>
                    <th className={th}>kcal</th>
                    <th className={th}>Score</th>
                    <th className={th}>Coût / portion</th>
                    <th className={th}>Anti-gaspillage</th>
                  </tr>
                </thead>
                <tbody>
                  {props.map((p) => (
                    <tr key={p.date} data-proposition={p.date} className="border-b last:border-0">
                      <td className={td}>{fr(p.date)}</td>
                      <td className={td}>{p.nom}</td>
                      <td className={td}>{p.kcal}</td>
                      <td className={td}>{p.score} / 100</td>
                      <td className={td}>{Math.round(p.cout)}</td>
                      <td className={td}>{p.antiGaspi > 0 ? p.antiGaspi + " ingrédient(s) à consommer" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {ecriture && props.length > 0 ? <FormBrouillons service={service} debut={debut} budget={budgetTxt} exclus={exclus} /> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}