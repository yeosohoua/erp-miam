import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { SERVICES, ajouterJours, aujourdhui, formaterNombre, libelleCourt, versIso } from "@/lib/menus"
import { calculerPrevisions, chargerCommande, chargerGaspillage } from "@/lib/prevision"
import { TYPES_EVENEMENT, TYPES_GASPILLAGE, type Confiance } from "@/lib/prevision-base"
import { accesProduction } from "@/lib/production-acces"

import { supprimerEvenement, supprimerGaspillage } from "./actions"
import { BonFormulaire, EvenementFormulaire, GaspillageFormulaire, PlanFormulaire } from "./formulaires"
import { GraphiqueGaspillagePlats, GraphiquePrevision } from "./graphiques"

const DEVISE = "FCFA"
const HORIZONS = [3, 7, 14]
const FENETRES = [7, 30, 90]
const CONFIANCES: Record<Confiance, string> = { FAIBLE: "Faible", MOYENNE: "Moyenne", BONNE: "Bonne" }
const un = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)
const montant = (n: number): string => formaterNombre(n) + " " + DEVISE

function Section({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">{titre}</h2>
        {aide ? <p className="text-sm text-muted-foreground">{aide}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Kpi({ id, libelle, valeur }: { id: string; libelle: string; valeur: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <p className="text-xl font-semibold" data-testid={id}>{valeur}</p>
    </div>
  )
}

function Filtre({ options, actif, href, suffixe }: { options: number[]; actif: number; href: (n: number) => string; suffixe: string }) {
  return (
    <div className="flex gap-1">
      {options.map((n) => (
        <Link key={n} href={href(n)} className={`rounded-md border px-2.5 py-1 text-xs ${n === actif ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
          {n} {suffixe}
        </Link>
      ))}
    </div>
  )
}

export async function ProductionView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await accesProduction()
  if (!a) return <div data-testid="acces-refuse" className="text-muted-foreground">Cette page est réservée à l&apos;équipe de production et d&apos;approvisionnement.</div>
  if (!a.etab) return <p className="text-muted-foreground">Aucun établissement actif.</p>

  const sp = await searchParams
  const h = Number(un(sp.h))
  const g = Number(un(sp.g))
  const horizon = HORIZONS.includes(h) ? h : 7
  const fenetre = FENETRES.includes(g) ? g : 30
  const etabId = a.etab.id
  const aujourdhuiIso = aujourdhui()

  const [prev, commande, gasp, plats, fournisseurs] = await Promise.all([
    calculerPrevisions(etabId, aujourdhuiIso, horizon),
    chargerCommande(etabId, horizon),
    chargerGaspillage(etabId, fenetre),
    db.plat.findMany({ where: { etablissementId: etabId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.fournisseur.findMany({ where: { etablissementId: etabId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const totalPrevus = prev.lignes.reduce((t, l) => t + (l.prevision.prevu ?? 0), 0)
  const planifies = prev.lignes.filter((l) => l.plan).length
  const evenements = prev.evenements.filter((e) => e.fin >= ajouterJours(aujourdhuiIso, -30))
  const hrefH = (n: number) => `/production?h=${n}&g=${fenetre}`
  const hrefG = (n: number) => `/production?h=${horizon}&g=${n}`

  return (
    <div className="space-y-6" data-testid="production-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Production et anti-gaspillage</h1>
          <p className="text-sm text-muted-foreground">Prévoir les repas, cuisiner juste, commander ce qui manque et mesurer les pertes.</p>
        </div>
        <Filtre options={HORIZONS} actif={horizon} href={hrefH} suffixe="jours" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi id="kpi-prevus" libelle="Repas prévus" valeur={formaterNombre(totalPrevus)} />
        <Kpi id="kpi-creneaux" libelle="Créneaux" valeur={String(prev.lignes.length)} />
        <Kpi id="kpi-planifies" libelle="Créneaux planifiés" valeur={String(planifies)} />
      </div>

      <Section titre="Prévisions" aide="Moyenne pondérée des mêmes jours de la semaine, ajustée par les réservations et le calendrier. L'intervalle couvre environ 80 % des cas.">
        <GraphiquePrevision
          data={prev.lignes.map((l) => ({
            label: `${libelleCourt(l.date)} · ${SERVICES[l.service]}`,
            prevu: l.prevision.prevu,
            bas: l.prevision.bas,
            ecart: Math.max(0, l.prevision.haut - l.prevision.bas),
            plan: l.plan ? l.plan.aProduire : null,
          }))}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="previsions">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Date</th><th className="pr-3">Service</th><th className="pr-3">Plats</th><th className="pr-3">Réservés</th>
                <th className="pr-3">Prévu</th><th className="pr-3">Intervalle</th><th className="pr-3">Confiance</th><th className="pr-3">Facteurs</th><th className="pr-3">Recommandé</th><th>À produire</th>
              </tr>
            </thead>
            <tbody>
              {prev.lignes.length === 0 ? <tr><td colSpan={10} className="py-4 text-muted-foreground">Aucun menu ni réservation sur la période.</td></tr> : null}
              {prev.lignes.map((l) => (
                <tr
                  key={l.date + l.service}
                  className="border-b last:border-0"
                  data-prevision=""
                  data-date={l.date}
                  data-service={l.service}
                  data-prevu={l.prevision.prevu ?? ""}
                  data-bas={l.prevision.bas}
                  data-haut={l.prevision.haut}
                  data-reserves={l.prevision.reserves}
                  data-confiance={l.prevision.confiance}
                >
                  <td className="py-2 pr-3">{libelleCourt(l.date)}</td>
                  <td className="pr-3">{SERVICES[l.service]}</td>
                  <td className="pr-3 text-muted-foreground">{l.plats.map((p) => p.nom).join(", ") || "Aucun menu"}</td>
                  <td className="pr-3">{l.prevision.reserves}</td>
                  <td className="pr-3 font-semibold">{l.prevision.prevu ?? "—"}</td>
                  <td className="pr-3">{l.prevision.prevu === null ? "—" : `${l.prevision.bas} à ${l.prevision.haut}`}</td>
                  <td className="pr-3"><Badge variant="secondary">{CONFIANCES[l.prevision.confiance]}</Badge></td>
                  <td className="pr-3 text-xs text-muted-foreground">{l.prevision.facteurs.map((f) => `${f.libelle} ${f.pct > 0 ? "+" : ""}${f.pct} %`).join(", ") || "—"}</td>
                  <td className="pr-3">{l.recommande ?? "—"}</td>
                  <td>
                    {a.ecriture ? (
                      <PlanFormulaire key={`${l.date}-${l.service}-${l.plan?.aProduire ?? "x"}`} date={l.date} service={l.service} valeur={l.plan?.aProduire ?? l.recommande} />
                    ) : (
                      <span>{l.plan?.aProduire ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section titre="À commander" aide={`Besoin des ${horizon} prochains jours + stock de sécurité − stock − commandes en cours (${formaterNombre(commande.repas)} repas retenus).`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="commande">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Ingrédient</th><th className="pr-3">Besoin</th><th className="pr-3">Stock</th><th className="pr-3">En commande</th><th className="pr-3">Sécurité</th><th className="pr-3">À commander</th><th>Coût</th>
              </tr>
            </thead>
            <tbody>
              {commande.lignes.length === 0 ? <tr><td colSpan={7} className="py-4 text-muted-foreground">Aucun besoin : renseignez des menus avec leurs recettes.</td></tr> : null}
              {commande.lignes.map((l) => (
                <tr key={l.ingredientId} className="border-b last:border-0" data-ingredient={l.nom} data-besoin={l.besoin} data-manque={l.manque}>
                  <td className="py-2 pr-3 font-medium">{l.nom}</td>
                  <td className="pr-3">{formaterNombre(l.besoin)} {l.unite}</td>
                  <td className="pr-3">{formaterNombre(l.stock)}</td>
                  <td className="pr-3">{formaterNombre(l.enCommande)}</td>
                  <td className="pr-3">{formaterNombre(l.securite)}</td>
                  <td className="pr-3 font-semibold">{formaterNombre(l.manque)} {l.unite}</td>
                  <td>{montant(l.coutManque)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm">Coût estimé à commander : <span className="font-semibold" data-testid="commande-total">{montant(commande.total)}</span></p>
        {a.commande ? <BonFormulaire fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.name }))} jours={horizon} /> : null}
      </Section>

      <Section titre="Restes et gaspillage" aide="Coût = portions × coût de revient d'une portion, figé à la saisie.">
        <Filtre options={FENETRES} actif={fenetre} href={hrefG} suffixe="jours" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi id="gaspillage-cout" libelle="Coût du gaspillage" valeur={montant(gasp.totalCout)} />
          <Kpi id="gaspillage-portions" libelle="Portions perdues" valeur={formaterNombre(gasp.totalPortions)} />
          <Kpi id="surplus-repas" libelle="Repas produits en trop" valeur={formaterNombre(gasp.surplus)} />
          <Kpi id="ecart-prevision" libelle="Écart moyen des prévisions" valeur={gasp.ecartMoyen === null ? "—" : `${gasp.ecartMoyen} %`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Plats les plus gaspillés (coût)</h3>
            <GraphiqueGaspillagePlats data={gasp.classement.map((c) => ({ nom: c.platNom, cout: c.cout }))} />
            <table className="mt-2 w-full text-sm">
              <tbody>
                {gasp.classement.map((c) => (
                  <tr key={c.platNom} className="border-b last:border-0" data-plat-gaspille={c.platNom} data-cout={c.cout}>
                    <td className="py-1.5 pr-3">{c.platNom}</td><td className="pr-3">{c.portions} portions</td><td>{montant(c.cout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Répartition par type</h3>
            <ul className="space-y-1 text-sm">
              {gasp.parType.length === 0 ? <li className="text-muted-foreground">Aucune saisie.</li> : null}
              {gasp.parType.map((t) => <li key={t.type}>{TYPES_GASPILLAGE[t.type]} : {t.portions} portions, {montant(t.cout)}</li>)}
            </ul>
          </div>
        </div>
        {a.ecriture ? <GaspillageFormulaire plats={plats.map((p) => ({ id: p.id, nom: p.name }))} aujourdhui={aujourdhuiIso} /> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="gaspillages">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Date</th><th className="pr-3">Service</th><th className="pr-3">Plat</th><th className="pr-3">Type</th><th className="pr-3">Portions</th><th className="pr-3">Coût</th><th className="pr-3">Note</th><th />
              </tr>
            </thead>
            <tbody>
              {gasp.rows.length === 0 ? <tr><td colSpan={8} className="py-4 text-muted-foreground">Aucun gaspillage enregistré.</td></tr> : null}
              {gasp.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0" data-gaspillage={r.id} data-plat={r.platNom} data-cout={r.cout} data-portions={r.portions}>
                  <td className="py-2 pr-3">{libelleCourt(r.date)}</td>
                  <td className="pr-3">{SERVICES[r.service]}</td>
                  <td className="pr-3 font-medium">{r.platNom}</td>
                  <td className="pr-3">{TYPES_GASPILLAGE[r.type]}</td>
                  <td className="pr-3">{r.portions}</td>
                  <td className="pr-3">{montant(r.cout)}</td>
                  <td className="pr-3 text-muted-foreground">{r.note ?? ""}</td>
                  <td>
                    {a.ecriture ? (
                      <form action={supprimerGaspillage.bind(null, r.id)}>
                        <Button type="submit" size="sm" variant="ghost">Supprimer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section titre="Calendrier" aide="Vacances, jours fériés, météo et événements : l'impact (en %) multiplie la prévision. Un impact de -100 ferme la journée et l'exclut de l'historique.">
        {a.ecriture ? <EvenementFormulaire /> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="evenements">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Type</th><th className="pr-3">Libellé</th><th className="pr-3">Début</th><th className="pr-3">Fin</th><th className="pr-3">Impact</th><th />
              </tr>
            </thead>
            <tbody>
              {evenements.length === 0 ? <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucun événement.</td></tr> : null}
              {evenements.map((e) => (
                <tr key={e.id} className="border-b last:border-0" data-evenement={e.id} data-libelle={e.libelle} data-impact={e.impactPct}>
                  <td className="py-2 pr-3"><Badge variant="secondary">{TYPES_EVENEMENT[e.type]}</Badge></td>
                  <td className="pr-3 font-medium">{e.libelle}</td>
                  <td className="pr-3">{e.debut}</td>
                  <td className="pr-3">{e.fin}</td>
                  <td className="pr-3">{e.impactPct > 0 ? "+" : ""}{e.impactPct} %</td>
                  <td>
                    {a.ecriture ? (
                      <form action={supprimerEvenement.bind(null, e.id)}>
                        <Button type="submit" size="sm" variant="ghost">Supprimer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}