import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, serviceValide, versDate, versIso } from "@/lib/menus"
import { LIBELLES_SOURCE, LIBELLES_STATUT_SUGGESTION, STATUTS_SUGGESTION, formaterMoyenne, notesParPlat, statsAvis, type SourceAvisCle, type StatutSuggestionCle } from "@/lib/satisfaction-base"
import { accesSatisfaction } from "@/lib/satisfaction-acces"

import { supprimerAvis, traiterSuggestion } from "./actions"
import { FormAvis, FormSuggestion, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { avis: "Avis", suggestions: "Suggestions" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const fr = (iso: string): string => iso.split("-").reverse().join("/")
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2"
const LIBELLES_SERVICE: Record<string, string> = { BREAKFAST: "Petit-déjeuner", LUNCH: "Déjeuner", SNACK: "Goûter", DINNER: "Dîner" }
const etoiles = (n: number): string => "★".repeat(n) + "☆".repeat(5 - n)

function Kpi({ nom, titre, valeur }: { nom: string; titre: string; valeur: string }) {
  return (
    <div data-kpi={nom} className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="text-2xl font-semibold">{valeur}</p>
    </div>
  )
}

export async function SatisfactionView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesSatisfaction()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, à la cuisine et à la caisse.
      </p>
    )
  }
  const { etab, saisie, traitement } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "avis"
  const jour = aujourdhui()
  return (
    <div className="flex flex-col gap-6" data-testid="satisfaction-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Satisfaction et participation</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — avis sur les repas et suggestions</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="satisfaction-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/satisfaction?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "avis" ? await Avis({ etabId: etab.id, saisie, traitement, jour }) : null}
      {vue === "suggestions" ? await Suggestions({ etabId: etab.id, saisie, traitement }) : null}
    </div>
  )
}

async function Avis({ etabId, saisie, traitement, jour }: { etabId: string; saisie: boolean; traitement: boolean; jour: string }) {
  const depuis = versDate(ajouterJours(jour, -30))
  const [avis, plats] = await Promise.all([
    db.avis.findMany({ where: { etablissementId: etabId, date: { gte: depuis } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }),
    db.plat.findMany({ where: { etablissementId: etabId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  const stats = statsAvis(avis.map((a) => a.note))
  const classement = notesParPlat(avis)
  const options: Option[] = plats.map((p) => ({ value: p.id, label: p.name }))
  const services: Option[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"].filter((s) => serviceValide(s)).map((s) => ({ value: s, label: LIBELLES_SERVICE[s] ?? s }))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="avis-nombre" titre="Avis du dernier mois" valeur={String(stats.nombre)} />
        <Kpi nom="avis-moyenne" titre="Note moyenne sur cinq" valeur={stats.nombre === 0 ? "—" : formaterMoyenne(stats.moyenne10)} />
        <Kpi nom="avis-satisfaits" titre="Satisfaits (notes de quatre et cinq)" valeur={stats.nombre === 0 ? "—" : stats.satisfaits + " %"} />
      </div>
      {saisie ? (
        <Card>
          <CardHeader>
            <CardTitle>Saisir un avis</CardTitle>
            <CardDescription>Recueillez l&apos;avis d&apos;un élève, d&apos;un parent ou d&apos;un membre du personnel sur un repas ou un plat.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormAvis plats={options} services={services} jour={jour} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Plats les mieux notés</CardTitle>
          <CardDescription>Classement par note moyenne sur le dernier mois.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="classement-plats">
            <thead>
              <tr className="border-b">
                <th className={th}>Plat</th>
                <th className={th}>Note moyenne</th>
                <th className={th}>Avis</th>
              </tr>
            </thead>
            <tbody>
              {classement.length === 0 ? (
                <tr>
                  <td colSpan={3} className={td + " text-muted-foreground"}>
                    Aucun avis rattaché à un plat.
                  </td>
                </tr>
              ) : null}
              {classement.map((p) => (
                <tr key={p.plat} data-plat-note data-plat={p.plat} data-moyenne={p.moyenne10} data-nombre={p.nombre} className="border-b">
                  <td className={td}>{p.plat}</td>
                  <td className={td}>{formaterMoyenne(p.moyenne10)} / 5</td>
                  <td className={td}>{p.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Derniers avis</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="avis">
            <thead>
              <tr className="border-b">
                <th className={th}>Date</th>
                <th className={th}>Service</th>
                <th className={th}>Plat</th>
                <th className={th}>Note</th>
                <th className={th}>Source</th>
                <th className={th}>Commentaire</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {avis.length === 0 ? (
                <tr>
                  <td colSpan={7} className={td + " text-muted-foreground"}>
                    Aucun avis sur le dernier mois.
                  </td>
                </tr>
              ) : null}
              {avis.slice(0, 50).map((a) => (
                <tr key={a.id} data-avis={a.id} data-note={a.note} data-plat={a.platNom ?? ""} className="border-b">
                  <td className={td}>{fr(versIso(a.date))}</td>
                  <td className={td}>{LIBELLES_SERVICE[a.service] ?? a.service}</td>
                  <td className={td}>{a.platNom ?? "Repas en général"}</td>
                  <td className={td} title={a.note + " sur 5"}>
                    {etoiles(a.note)}
                  </td>
                  <td className={td}>{LIBELLES_SOURCE[a.source as SourceAvisCle]}{a.auteur ? " · " + a.auteur : ""}</td>
                  <td className={td}>{a.commentaire ?? ""}</td>
                  <td className={td}>
                    {traitement ? (
                      <form action={supprimerAvis.bind(null, a.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          Supprimer
                        </Button>
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

async function Suggestions({ etabId, saisie, traitement }: { etabId: string; saisie: boolean; traitement: boolean }) {
  const suggestions = await db.suggestion.findMany({ where: { etablissementId: etabId }, orderBy: { createdAt: "desc" }, take: 200 })
  const compte = (s: string): number => suggestions.filter((x) => x.statut === s).length
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="sug-nouvelles" titre="Suggestions nouvelles" valeur={String(compte("NOUVELLE"))} />
        <Kpi nom="sug-en-cours" titre="Suggestions en cours" valeur={String(compte("EN_COURS"))} />
        <Kpi nom="sug-traitees" titre="Suggestions traitées" valeur={String(compte("TRAITEE"))} />
      </div>
      {saisie ? (
        <Card>
          <CardHeader>
            <CardTitle>Proposer une suggestion</CardTitle>
            <CardDescription>Idée de plat, d&apos;organisation du service ou d&apos;amélioration de la cantine.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormSuggestion />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Suggestions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="suggestions">
            <thead>
              <tr className="border-b">
                <th className={th}>Date</th>
                <th className={th}>Suggestion</th>
                <th className={th}>Auteur</th>
                <th className={th}>Statut</th>
                <th className={th}>Réponse</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.length === 0 ? (
                <tr>
                  <td colSpan={5} className={td + " text-muted-foreground"}>
                    Aucune suggestion.
                  </td>
                </tr>
              ) : null}
              {suggestions.map((s) => (
                <tr key={s.id} data-suggestion={s.id} data-titre={s.titre} data-statut={s.statut} className="border-b align-top">
                  <td className={td}>{fr(versIso(s.createdAt))}</td>
                  <td className={td}>
                    <p className="font-medium">{s.titre}</p>
                    {s.detail ? <p className="text-muted-foreground">{s.detail}</p> : null}
                  </td>
                  <td className={td}>{s.auteur ?? ""}</td>
                  <td className={td}>{LIBELLES_STATUT_SUGGESTION[s.statut as StatutSuggestionCle]}</td>
                  <td className={td}>
                    {traitement ? (
                      <form action={traiterSuggestion.bind(null, s.id)} className="flex flex-wrap gap-2">
                        <select name="statut" defaultValue={s.statut} className="h-9 rounded-md border bg-background px-2 text-sm">
                          {STATUTS_SUGGESTION.map((x) => (
                            <option key={x} value={x}>
                              {LIBELLES_STATUT_SUGGESTION[x]}
                            </option>
                          ))}
                        </select>
                        <input name="reponse" type="text" maxLength={500} defaultValue={s.reponse ?? ""} placeholder="Réponse" className="h-9 min-w-48 flex-1 rounded-md border bg-background px-3 text-sm" />
                        <Button type="submit" size="sm">
                          Enregistrer
                        </Button>
                      </form>
                    ) : (
                      (s.reponse ?? "")
                    )}
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