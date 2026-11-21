import Link from "next/link"
import type { ReactNode } from "react"

import { PERIODES_ANALYTICS, VUES, avecFinance, periodeAnalytics, vueAnalytics, vuesPour, type TableExport } from "@/lib/analytics-base"
import { chargerCaisse, chargerFinances, chargerFrequentation, chargerInscrits, chargerProduction, chargerStock, contexte } from "@/lib/analytics"
import { contexteEtablissement } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { formaterNombre } from "@/lib/menus"
import { ANALYTICS_LECTURE, PAIE_LECTURE, hasRole } from "@/lib/permissions"
import { ORDRE_SERVICES, SERVICES } from "@/lib/menus"

import { CalendrierThermique, Cascade, CarteArbre, CarteChaleur, Donut, Entonnoir, GraphAire, GraphBarres, GraphMixte, Jauge, RadarComparaison, Spark } from "./graphiques"

const f = (n: number): string => formaterNombre(n) + " FCFA"
const pct = (n: number | null): string => (n === null ? "—" : String(n).replace(".", ",") + " %")
const un = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

function Carte({ titre, aide, children, large = false }: { titre: string; aide?: string; children: ReactNode; large?: boolean }) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${large ? "lg:col-span-2" : ""}`}>
      <h3 className="font-medium">{titre}</h3>
      <p className="mb-3 min-h-4 text-xs text-muted-foreground">{aide}</p>
      {children}
    </section>
  )
}

function Kpi({ id, libelle, valeur, brut, evolution, inverse = false, spark, aide }: { id: string; libelle: string; valeur: string; brut?: number | null; evolution?: number | null; inverse?: boolean; spark?: number[]; aide?: string }) {
  const bon = evolution === undefined || evolution === null || evolution === 0 ? null : evolution > 0 !== inverse
  return (
    <div className="rounded-xl border bg-card p-4" data-kpi={id} data-valeur={brut ?? ""}>
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
        {spark ? <div className="w-24"><Spark data={spark} /></div> : null}
      </div>
      {evolution !== undefined ? (
        <p className={`mt-1 text-xs ${bon === null ? "text-muted-foreground" : bon ? "text-emerald-600" : "text-red-600"}`}>
          {evolution === null ? "—" : `${evolution > 0 ? "▲ +" : evolution < 0 ? "▼ " : ""}${evolution} %`} <span className="text-muted-foreground">vs période précédente</span>
        </p>
      ) : aide ? (
        <p className="mt-1 text-xs text-muted-foreground">{aide}</p>
      ) : null}
    </div>
  )
}

const Grille = ({ children }: { children: ReactNode }) => <div className="grid gap-4 lg:grid-cols-2">{children}</div>
const Cartes = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
const SERIES_SERVICES = ORDRE_SERVICES.map((s) => ({ key: s, label: SERVICES[s] }))

type Freq = Awaited<ReturnType<typeof chargerFrequentation>>
type Fin = Awaited<ReturnType<typeof chargerFinances>>
type Prod = Awaited<ReturnType<typeof chargerProduction>>
type Stk = Awaited<ReturnType<typeof chargerStock>>
type Cai = Awaited<ReturnType<typeof chargerCaisse>>
type Ins = Awaited<ReturnType<typeof chargerInscrits>>

function Frequentation({ d }: { d: Freq }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="servis" libelle="Repas servis" valeur={formaterNombre(k.servis)} brut={k.servis} evolution={k.evolution} spark={d.serie.map((p) => p.servis)} />
        <Kpi id="moyenne-jour" libelle="Moyenne par jour ouvré" valeur={formaterNombre(k.moyenneJour)} brut={k.moyenneJour} aide={k.meilleurJour ? `Record : ${k.meilleurJour.valeur} le ${k.meilleurJour.label}` : undefined} />
        <Kpi id="presence" libelle="Taux de présence" valeur={pct(k.presence)} brut={k.presence} aide={`${k.servisReserves} servis sur ${k.reserves} réservés`} />
        <Kpi id="tendance" libelle="Tendance sur la période" valeur={d.tendance.variationPct === null ? "—" : `${d.tendance.variationPct > 0 ? "+" : ""}${d.tendance.variationPct} %`} brut={d.tendance.variationPct} aide="Droite des moindres carrés, jours ouvrés" />
      </Cartes>
      <Grille>
        <Carte titre="Réservés et servis" aide="L'écart entre les deux courbes mesure les absences et les repas non réservés." large>
          <GraphAire data={d.serie} series={[{ key: "reserves", label: "Réservés", color: "var(--chart-2)" }, { key: "servis", label: "Servis", color: "var(--chart-1)" }]} />
        </Carte>
        <Carte titre="Repas servis par service" aide="Répartition quotidienne empilée.">
          <GraphBarres data={d.parServiceJour} series={SERIES_SERVICES} empile />
        </Carte>
        <Carte titre="Poids de chaque service">
          <Donut data={d.parService.map((p) => ({ nom: p.label, valeur: p.valeur }))} centre={{ valeur: formaterNombre(k.servis), libelle: "repas servis" }} />
        </Carte>
        <Carte titre="Jour de la semaine × service" aide="Nombre moyen de repas : repérez les creux pour ajuster la production.">
          <CarteChaleur {...d.heatmap} />
        </Carte>
        <Carte titre="Calendrier de fréquentation" aide="Une case par jour, plus foncée quand l'affluence est forte.">
          <CalendrierThermique semaines={d.calendrier.semaines} />
        </Carte>
        <Carte titre="De la réservation au repas" aide={`${k.walkIns} repas servis sans réservation (hors entonnoir).`}>
          <Entonnoir etapes={[{ nom: "Réservés", valeur: k.reserves }, { nom: "Servis", valeur: k.servisReserves }, { nom: "Absents", valeur: k.absents }]} />
        </Carte>
      </Grille>
    </div>
  )
}

function Finances({ d }: { d: Fin }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="ca" libelle="Chiffre d'affaires" valeur={f(k.ca)} brut={k.ca} evolution={k.evolution} spark={d.revenuSerie.map((p) => p.repas + p.direct)} />
        <Kpi id="ca-repas" libelle="Recette par repas servi" valeur={k.parRepas === null ? "—" : f(k.parRepas)} brut={k.parRepas} />
        <Kpi id="matieres" libelle="Matières consommées" valeur={f(k.matieres)} brut={k.matieres} evolution={k.matieresEvolution} inverse spark={d.matieresSerie.map((p) => p.valeur)} />
        <Kpi id="marge" libelle="Marge brute" valeur={f(k.margeBrute)} brut={k.margeBrute} aide={`${pct(k.margePct)} du chiffre d'affaires`} />
        <Kpi id="creances" libelle="Créances clients ouvertes" valeur={f(k.creances)} brut={k.creances} />
        <Kpi id="solde-comptes" libelle="Avances sur comptes prépayés" valeur={f(k.soldeComptes)} brut={k.soldeComptes} aide="Dette envers les familles" />
      </Cartes>
      <Grille>
        <Carte titre="Chiffre d'affaires par origine" aide="Repas prélevés sur les comptes et ventes directes au comptoir." large>
          <GraphAire data={d.revenuSerie} series={[{ key: "repas", label: "Repas prélevés", color: "var(--chart-1)" }, { key: "direct", label: "Ventes directes", color: "var(--chart-3)" }]} empile />
        </Carte>
        <Carte titre="De la recette à la marge brute" aide="Le coût des matières vient des sorties de stock liées aux repas servis.">
          <Cascade etapes={d.cascade} />
        </Carte>
        <Carte titre="Sources de recettes">
          <Donut data={d.sources} centre={{ valeur: formaterNombre(k.ca), libelle: "FCFA" }} />
        </Carte>
        <Carte titre="Recharges par moyen de paiement" aide="D'où vient l'argent des familles.">
          <GraphBarres data={d.rechargesParMethode} series={[{ key: "montant", label: "Recharges" }]} categorie="label" horizontal />
        </Carte>
        <Carte titre="Rythme des recharges">
          <GraphAire data={d.rechargesSerie} series={[{ key: "valeur", label: "Recharges", color: "var(--chart-2)" }]} />
        </Carte>
        <Carte titre="Coût des matières par jour">
          <GraphAire data={d.matieresSerie} series={[{ key: "valeur", label: "Matières", color: "var(--chart-5)" }]} />
        </Carte>
        <Carte titre="Factures émises sur la période">
          <table className="w-full text-sm" data-testid="factures-statut">
            <tbody>
              {d.facturesParStatut.length === 0 ? <tr><td className="py-2 text-muted-foreground">Aucune facture.</td></tr> : null}
              {d.facturesParStatut.map((x) => (
                <tr key={x.statut} className="border-b last:border-0" data-statut={x.statut} data-total={x.total}>
                  <td className="py-2">{x.label}</td><td>{x.n} facture(s)</td><td className="text-right tabular-nums">{f(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.reglementsParMethode.length ? (
            <p className="mt-3 text-xs text-muted-foreground">Règlements : {d.reglementsParMethode.map((r) => `${r.label} ${f(r.montant)}`).join(" · ")}</p>
          ) : null}
        </Carte>
        {d.paie.length ? (
          <Carte titre="Masse salariale des 6 derniers mois" aide="Bulletins de paie : brut, net et coût employeur.">
            <GraphBarres data={d.paie} series={[{ key: "brut", label: "Brut" }, { key: "net", label: "Net" }, { key: "cout", label: "Coût employeur" }]} />
          </Carte>
        ) : null}
      </Grille>
    </div>
  )
}

function Production({ d }: { d: Prod }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="cout-gaspillage" libelle="Coût du gaspillage" valeur={f(k.cout)} brut={k.cout} spark={d.serieGaspillage.map((p) => p.valeur)} />
        <Kpi id="taux-gaspillage" libelle="Portions perdues / servies" valeur={pct(k.tauxGaspillage)} brut={k.tauxGaspillage} aide={`${k.portions} portions perdues`} />
        <Kpi id="cout-repas" libelle="Gaspillage par repas servi" valeur={k.coutParRepas === null ? "—" : f(k.coutParRepas)} brut={k.coutParRepas} />
        <Kpi id="ecart-prevision" libelle="Écart moyen des prévisions" valeur={k.ecartMoyen === null ? "—" : `${k.ecartMoyen} %`} brut={k.ecartMoyen} aide={`${k.surplus} repas produits en trop`} />
      </Cartes>
      <Grille>
        <Carte titre="Prévu, produit et servi" aide="Si les barres dépassent la courbe des servis, vous produisez trop." large>
          <GraphMixte data={d.prevuReel} barres={[{ key: "aProduire", label: "À produire", color: "var(--chart-3)" }]} lignes={[{ key: "prevus", label: "Prévus", color: "var(--chart-1)" }, { key: "servis", label: "Servis", color: "var(--chart-2)" }]} />
        </Carte>
        <Carte titre="Pareto du gaspillage" aide="Peu de plats concentrent l'essentiel des pertes : traitez-les en premier." large>
          <GraphMixte data={d.pareto} barres={[{ key: "valeur", label: "Coût", color: "var(--chart-5)" }]} droite={{ key: "cumulPct", label: "Cumul (%)", color: "var(--chart-1)" }} categorie="nom" />
        </Carte>
        <Carte titre="Coût du gaspillage par jour">
          <GraphBarres data={d.serieGaspillage} series={[{ key: "valeur", label: "Coût", color: "var(--chart-5)" }]} />
        </Carte>
        <Carte titre="Nature des pertes">
          <Donut data={d.parType.map((t) => ({ nom: t.label, valeur: t.cout }))} centre={{ valeur: formaterNombre(k.cout), libelle: "FCFA perdus" }} />
        </Carte>
        <Carte titre="Performance par service" aide="Présence, précision des prévisions et maîtrise du gaspillage (100 = idéal)." large>
          <RadarComparaison lignes={d.radar} />
        </Carte>
      </Grille>
    </div>
  )
}

function Stock({ d }: { d: Stk }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="valeur-stock" libelle="Valeur du stock" valeur={f(k.valeurStock)} brut={k.valeurStock} />
        <Kpi id="alertes-stock" libelle="Ingrédients sous le seuil" valeur={String(k.alertes)} brut={k.alertes} />
        <Kpi id="conso-stock" libelle="Consommation de la période" valeur={f(k.consommation)} brut={k.consommation} spark={d.consommationSerie.map((p) => p.valeur)} aide={k.rotationPct === null ? undefined : `${k.rotationPct} % du stock`} />
        <Kpi id="achats" libelle="Achats commandés" valeur={f(k.achats)} brut={k.achats} aide={`${k.pertesNb} perte(s) : ${f(k.pertesValeur)}`} />
      </Cartes>
      <Grille>
        <Carte titre="Où dort l'argent du stock" aide="Surface proportionnelle à la valeur en stock.">
          <CarteArbre data={d.treemap} />
        </Carte>
        <Carte titre="Couverture en jours" aide="Jours restants au rythme de consommation de la période : les plus courts d'abord.">
          <GraphBarres data={d.couverture.map((c) => ({ nom: c.nom, jours: c.jours }))} series={[{ key: "jours", label: "Jours de couverture", color: "var(--chart-4)" }]} categorie="nom" horizontal />
        </Carte>
        <Carte titre="Consommation par jour">
          <GraphAire data={d.consommationSerie} series={[{ key: "valeur", label: "Consommation", color: "var(--chart-1)" }]} />
        </Carte>
        <Carte titre="Achats par fournisseur">
          <GraphBarres data={d.achats.map((a) => ({ nom: a.nom, valeur: a.valeur }))} series={[{ key: "valeur", label: "Achats", color: "var(--chart-3)" }]} categorie="nom" horizontal />
        </Carte>
        <Carte titre="Ingrédients à réapprovisionner" large>
          <table className="w-full text-sm" data-testid="alertes-stock">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Ingrédient</th><th>Stock</th><th>Seuil</th></tr></thead>
            <tbody>
              {d.alertes.length === 0 ? <tr><td colSpan={3} className="py-3 text-muted-foreground">Aucune alerte : tout est au-dessus du seuil.</td></tr> : null}
              {d.alertes.map((a) => (
                <tr key={a.nom} className="border-b last:border-0" data-ingredient={a.nom}>
                  <td className="py-2 font-medium">{a.nom}</td><td>{formaterNombre(a.stock)} {a.unite}</td><td>{formaterNombre(a.seuil)} {a.unite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      </Grille>
    </div>
  )
}

function Caisse({ d }: { d: Cai }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="caisse-ca" libelle="Chiffre d'affaires caisse" valeur={f(k.ca)} brut={k.ca} evolution={k.evolution} spark={d.serie.map((p) => p.ca)} />
        <Kpi id="tickets" libelle="Tickets" valeur={formaterNombre(k.tickets)} brut={k.tickets} aide={`${k.annulees} annulé(s), ${pct(k.tauxAnnulation)}`} />
        <Kpi id="ticket-moyen" libelle="Ticket moyen" valeur={k.ticketMoyen === null ? "—" : f(k.ticketMoyen)} brut={k.ticketMoyen} />
        <Kpi id="articles-ticket" libelle="Articles par ticket" valeur={k.articlesParTicket === null ? "—" : String(k.articlesParTicket).replace(".", ",")} brut={k.articlesParTicket} />
      </Cartes>
      <Grille>
        <Carte titre="Chiffre d'affaires par jour" large>
          <GraphAire data={d.serie} series={[{ key: "ca", label: "Chiffre d'affaires", color: "var(--chart-1)" }]} />
        </Carte>
        <Carte titre="Affluence par heure" aide="Dimensionnez le personnel de caisse sur les heures de pointe.">
          <GraphBarres data={d.heures} series={[{ key: "ventes", label: "Ventes", color: "var(--chart-2)" }]} categorie="heure" />
        </Carte>
        <Carte titre="Ventes par jour de la semaine">
          <GraphBarres data={d.semaine} series={[{ key: "montant", label: "Montant", color: "var(--chart-3)" }]} categorie="jour" />
        </Carte>
        <Carte titre="Modes de paiement">
          <Donut data={d.parMode.map((m) => ({ nom: m.label, valeur: m.montant }))} centre={{ valeur: String(k.tickets), libelle: "tickets" }} />
        </Carte>
        <Carte titre="Articles les plus rentables">
          <GraphBarres data={d.topArticles.map((a) => ({ nom: a.nom, montant: a.montant }))} series={[{ key: "montant", label: "Montant", color: "var(--chart-4)" }]} categorie="nom" horizontal />
        </Carte>
      </Grille>
    </div>
  )
}

function Inscrits({ d }: { d: Ins }) {
  const k = d.kpi
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="inscrits-total" libelle="Inscrits" valeur={formaterNombre(k.total)} brut={k.total} />
        <Kpi id="solde-total" libelle="Soldes cumulés" valeur={f(k.soldeTotal)} brut={k.soldeTotal} />
        <Kpi id="soldes-nuls" libelle="Comptes à zéro" valeur={String(k.soldesNuls)} brut={k.soldesNuls} aide="Familles à relancer pour une recharge" />
        <Kpi id="soldes-negatifs" libelle="Comptes négatifs" valeur={String(k.soldesNegatifs)} brut={k.soldesNegatifs} />
      </Cartes>
      <Grille>
        <Carte titre="Par catégorie">
          <Donut data={d.parType} centre={{ valeur: formaterNombre(k.total), libelle: "inscrits" }} />
        </Carte>
        <Carte titre="Par statut">
          <Donut data={d.parStatut} />
        </Carte>
        <Carte titre="Répartition des soldes" aide="Nombre de comptes par tranche de solde (FCFA).">
          <GraphBarres data={d.tranchesSolde} series={[{ key: "n", label: "Comptes", color: "var(--chart-2)" }]} />
        </Carte>
        <Carte titre="Croissance des effectifs" aide="Cumul des inscriptions sur 6 mois.">
          <GraphAire data={d.croissance} series={[{ key: "total", label: "Inscrits", color: "var(--chart-1)" }]} />
        </Carte>
        <Carte titre="Les plus assidus de la période" large>
          <table className="w-full text-sm" data-testid="assiduite">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Matricule</th><th>Nom</th><th>Repas servis</th></tr></thead>
            <tbody>
              {d.assiduite.length === 0 ? <tr><td colSpan={3} className="py-3 text-muted-foreground">Aucun repas servi sur la période.</td></tr> : null}
              {d.assiduite.map((a) => (
                <tr key={a.matricule + a.nom} className="border-b last:border-0"><td className="py-2">{a.matricule}</td><td>{a.nom}</td><td>{a.repas}</td></tr>
              ))}
            </tbody>
          </table>
        </Carte>
      </Grille>
    </div>
  )
}

function Apercu({ freq, fin, prod, stock }: { freq: Freq; fin: Fin | null; prod: Prod; stock: Stk }) {
  return (
    <div className="space-y-4">
      <Cartes>
        <Kpi id="servis" libelle="Repas servis" valeur={formaterNombre(freq.kpi.servis)} brut={freq.kpi.servis} evolution={freq.kpi.evolution} spark={freq.serie.map((p) => p.servis)} />
        <Kpi id="presence" libelle="Taux de présence" valeur={pct(freq.kpi.presence)} brut={freq.kpi.presence} aide={`${freq.kpi.servisReserves} servis sur ${freq.kpi.reserves} réservés`} />
        {fin ? <Kpi id="ca" libelle="Chiffre d'affaires" valeur={f(fin.kpi.ca)} brut={fin.kpi.ca} evolution={fin.kpi.evolution} spark={fin.revenuSerie.map((p) => p.repas + p.direct)} /> : null}
        {fin ? <Kpi id="marge" libelle="Marge brute" valeur={pct(fin.kpi.margePct)} brut={fin.kpi.margePct} aide={f(fin.kpi.margeBrute)} /> : null}
        <Kpi id="cout-gaspillage" libelle="Coût du gaspillage" valeur={f(prod.kpi.cout)} brut={prod.kpi.cout} spark={prod.serieGaspillage.map((p) => p.valeur)} />
        <Kpi id="alertes-stock" libelle="Ingrédients sous le seuil" valeur={String(stock.kpi.alertes)} brut={stock.kpi.alertes} />
      </Cartes>
      <Grille>
        <Carte titre="Fréquentation" aide="Réservés et servis sur la période." large>
          <GraphAire data={freq.serie} series={[{ key: "reserves", label: "Réservés", color: "var(--chart-2)" }, { key: "servis", label: "Servis", color: "var(--chart-1)" }]} />
        </Carte>
        {fin ? (
          <Carte titre="Chiffre d'affaires" aide="Par origine de recette." large>
            <GraphAire data={fin.revenuSerie} series={[{ key: "repas", label: "Repas prélevés", color: "var(--chart-1)" }, { key: "direct", label: "Ventes directes", color: "var(--chart-3)" }]} empile />
          </Carte>
        ) : null}
        <Carte titre="Présence face à l'objectif" aide="Objectif : 90 % des repas réservés réellement servis.">
          <Jauge valeur={freq.kpi.presence} objectif={90} libelle="présence" />
        </Carte>
        <Carte titre="Poids de chaque service">
          <Donut data={freq.parService.map((p) => ({ nom: p.label, valeur: p.valeur }))} centre={{ valeur: formaterNombre(freq.kpi.servis), libelle: "repas servis" }} />
        </Carte>
        <Carte titre="Nature des pertes">
          <Donut data={prod.parType.map((t) => ({ nom: t.label, valeur: t.cout }))} centre={{ valeur: formaterNombre(prod.kpi.cout), libelle: "FCFA perdus" }} />
        </Carte>
        <Carte titre="À réapprovisionner">
          <ul className="space-y-1 text-sm" data-testid="apercu-alertes">
            {stock.alertes.length === 0 ? <li className="text-muted-foreground">Aucune alerte de stock.</li> : null}
            {stock.alertes.slice(0, 6).map((a) => <li key={a.nom}>{a.nom} : {formaterNombre(a.stock)} {a.unite} (seuil {formaterNombre(a.seuil)})</li>)}
          </ul>
        </Carte>
      </Grille>
    </div>
  )
}

export async function AnalyticsView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()
  if (!hasRole(session.role, ANALYTICS_LECTURE)) return <div data-testid="acces-refuse" className="text-muted-foreground">Cette page est réservée à la direction, à la comptabilité et à la cuisine.</div>
  const { courant } = await contexteEtablissement()
  if (!courant) return <p className="text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const n = periodeAnalytics(un(sp.p))
  const vue = vueAnalytics(un(sp.vue), session.role)
  const c = contexte(courant.id, n)
  const finance = avecFinance(session.role)

  let corps: ReactNode
  let tables: TableExport[] = []
  if (vue === "frequentation") {
    const d = await chargerFrequentation(c)
    tables = d.tables
    corps = <Frequentation d={d} />
  } else if (vue === "finances") {
    const d = await chargerFinances(c, hasRole(session.role, PAIE_LECTURE))
    tables = d.tables
    corps = <Finances d={d} />
  } else if (vue === "production") {
    const d = await chargerProduction(c)
    tables = d.tables
    corps = <Production d={d} />
  } else if (vue === "stock") {
    const d = await chargerStock(c)
    tables = d.tables
    corps = <Stock d={d} />
  } else if (vue === "caisse") {
    const d = await chargerCaisse(c)
    tables = d.tables
    corps = <Caisse d={d} />
  } else if (vue === "inscrits") {
    const d = await chargerInscrits(c)
    tables = d.tables
    corps = <Inscrits d={d} />
  } else {
    const [freq, fin, prod, stock] = await Promise.all([chargerFrequentation(c), finance ? chargerFinances(c, false) : Promise.resolve(null), chargerProduction(c), chargerStock(c)])
    tables = freq.tables
    corps = <Apercu freq={freq} fin={fin} prod={prod} stock={stock} />
  }

  return (
    <div className="space-y-5" data-testid="analytics-page" data-vue={vue} data-periode={n}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Du {c.debut} au {c.fin}, comparé aux {n} jours précédents.</p>
        </div>
        <div className="flex gap-1">
          {PERIODES_ANALYTICS.map((p) => (
            <Link key={p} href={`/analytics?vue=${vue}&p=${p}`} data-periode-lien={p} className={`rounded-md border px-2.5 py-1 text-xs ${p === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {p} jours
            </Link>
          ))}
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Rubriques d'analyse" data-testid="analytics-onglets">
        {vuesPour(session.role).map((v) => (
          <Link key={v} href={`/analytics?vue=${v}&p=${n}`} data-onglet={v} className={`rounded-md px-3 py-1.5 text-sm ${v === vue ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}>
            {VUES[v]}
          </Link>
        ))}
      </nav>
      {corps}
      {tables.length ? (
        <p className="text-xs text-muted-foreground" data-testid="exports">
          Exporter (CSV) :{" "}
          {tables.map((t, i) => (
            <a key={t.nom} href={`/api/analytics/export?vue=${vue}&p=${n}&table=${i}`} data-export={t.nom} className="mr-3 underline">{t.nom}</a>
          ))}
        </p>
      ) : null}
    </div>
  )
}