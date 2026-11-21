import { Coins, Percent, PiggyBank, ShoppingCart, TrendingDown, TrendingUp, UserPlus, Users, Utensils, Wallet } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { contexteEtablissement } from "@/lib/etablissement"
import { TYPES_ETABLISSEMENT, type TypeEtablissement } from "@/lib/etablissements"
import { requireSession } from "@/lib/guards"
import { formaterMontant, libelleCourt } from "@/lib/menus"
import { navGroupsPour } from "@/lib/navigation"
import { MENUS_LECTURE, PAIEMENTS_LECTURE, RESERVATIONS_LECTURE, hasRole } from "@/lib/permissions"
import { chargerRecettes, chargerRevenu } from "@/lib/recettes"
import { LIBELLES_ROLES, type RoleValue } from "@/lib/roles"
import { OBJECTIF_PRESENCE, PERIODES, chargerTableauBord, libelleJourMois, periodeValide, type PeriodeCle } from "@/lib/tableau-bord"

import { GraphiqueFrequentation, GraphiquePerformance, GraphiqueReservations, GraphiqueServices } from "./graphiques"
import { CarteRecettes } from "./recettes-carte"

const NOMBRE = new Intl.NumberFormat("fr-FR")
const POURCENT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })
const pct = (n: number, total: number): string => (total > 0 ? POURCENT.format((n * 100) / total) + " %" : "0 %")
const SEGMENTS = 48

function Variation({ valeur, unite }: { valeur: number | null; unite: string }) {
  if (valeur === null) return <span className="text-xs text-muted-foreground">nouveau</span>
  const hausse = valeur >= 0
  const Icone = hausse ? TrendingUp : TrendingDown
  return (
    <span className={"inline-flex items-center gap-1 text-xs font-medium " + (hausse ? "text-emerald-600" : "text-red-600")}>
      <Icone className="size-3.5" />
      {hausse ? "+" : ""}
      {valeur} {unite}
    </span>
  )
}

function Kpi({ titre, valeur, brut, icone: Icone, testid, variation, note }: { titre: string; valeur: string; brut: number | string; icone: typeof Users; testid: string; variation?: React.ReactNode; note: string }) {
  return (
    <Card data-testid={testid} data-valeur={brut}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{titre}</CardDescription>
          <span className="rounded-md bg-muted p-1.5">
            <Icone className="size-4 text-muted-foreground" />
          </span>
        </div>
        <CardTitle className="text-3xl tabular-nums">{valeur}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {variation}
        <span>{note}</span>
      </CardContent>
    </Card>
  )
}

function Legende({ items }: { items: { nom: string; couleur: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.nom} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.couleur }} />
          {i.nom}
        </span>
      ))}
    </div>
  )
}

// Barre de segments : servis (bleu soutenu), prevision (bleu clair), reste (neutre).
function BarreSegments({ pleins, prevus }: { pleins: number; prevus: number }) {
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          data-pill={i < pleins ? "plein" : i < prevus ? "prevu" : "vide"}
          className="h-12 flex-1 rounded-full"
          style={{ background: i < pleins ? "linear-gradient(180deg,#3b82f6,#1d4ed8)" : i < prevus ? "#93c5fd" : "var(--muted)" }}
        />
      ))}
    </div>
  )
}

export async function DashboardView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()
  const { courant } = await contexteEtablissement()
  const sp = await searchParams
  const brut = (Array.isArray(sp.periode) ? sp.periode[0] : sp.periode) ?? ""
  const periode: PeriodeCle = periodeValide(brut) ? brut : "7j"
  const analyses = courant !== null && hasRole(session.role, RESERVATIONS_LECTURE)
  const avecCout = hasRole(session.role, MENUS_LECTURE)

  const modules = navGroupsPour(session.role)
    .flatMap((g) => g.items)
    .filter((i) => i.url !== "/")

  const [donnees, devise] =
    analyses && courant
      ? await Promise.all([chargerTableauBord(courant.id, periode, avecCout), db.etablissement.findUnique({ where: { id: courant.id }, select: { currency: true } }).then((e) => e?.currency ?? "XOF")])
      : [null, "XOF"]

  const recettes = donnees && courant && hasRole(session.role, PAIEMENTS_LECTURE) ? await chargerRecettes(courant.id, periode) : null
  const revenu = donnees && courant && hasRole(session.role, PAIEMENTS_LECTURE) ? await chargerRevenu(courant.id, periode) : null
  const insights: string[] = []
  if (donnees) {
    if (donnees.meilleurService) insights.push("Service le plus fréquenté : " + donnees.meilleurService.label + " (" + donnees.meilleurService.servis + " repas servis).")
    if (donnees.kpi.taux !== null) {
      insights.push("Le taux de présence est de " + donnees.kpi.taux + " %, " + (donnees.kpi.taux >= OBJECTIF_PRESENCE ? "au-dessus de" : "sous") + " l'objectif de " + OBJECTIF_PRESENCE + " %.")
    }
    insights.push(
      donnees.menus.manquants > 0
        ? donnees.menus.manquants + " créneau(x) sans menu publié sur les 7 prochains jours."
        : "Tous les créneaux des 7 prochains jours ont un menu publié.",
    )
    if (donnees.allergiesAujourdhui > 0) insights.push(donnees.allergiesAujourdhui + " inscrit(s) avec allergie réservé(s) aujourd'hui : vérifiez les plats.")
    if (donnees.kpi.horsReservation > 0) insights.push(donnees.kpi.horsReservation + " repas servi(s) hors réservation sur la période.")
  }
  const maxGroupe = donnees ? Math.max(1, ...donnees.groupes.map((g) => g.servis)) : 1
  const totalServices = donnees ? donnees.services.reduce((t, s) => t + s.servis, 0) : 0
  const mois = donnees?.mois
  const pleins = mois && mois.cible > 0 ? Math.min(SEGMENTS, Math.round((mois.servis / mois.cible) * SEGMENTS)) : 0
  const prevus = mois && mois.cible > 0 ? Math.min(SEGMENTS, Math.max(pleins, Math.round((mois.prevision / mois.cible) * SEGMENTS))) : 0
  const issue = donnees?.issue

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Bonjour {session.name}</h2>
            <p className="text-sm text-muted-foreground">{donnees ? "Vue d'ensemble de la cantine, du " + libelleCourt(donnees.debut) + " au " + libelleCourt(donnees.fin) + "." : "Voici les modules auxquels vous avez accès."}</p>
          </div>
          <Badge variant="secondary">{LIBELLES_ROLES[session.role as RoleValue] ?? session.role}</Badge>
        </div>
        {donnees ? (
          <nav aria-label="Période" className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm" data-testid="periodes">
            {(Object.keys(PERIODES) as PeriodeCle[]).map((cle) => (
              <Link key={cle} href={"/?periode=" + cle} data-periode={cle} aria-current={cle === periode ? "true" : undefined} className={"rounded-md px-3 py-1.5 font-medium " + (cle === periode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {PERIODES[cle].libelle}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      {courant ? (
        <p className="text-sm" data-testid="etab-courant">
          Établissement : <span className="font-medium">{courant.name}</span> ({TYPES_ETABLISSEMENT[courant.type as TypeEtablissement] ?? courant.type})
        </p>
      ) : (
        <p className="text-sm text-destructive" data-testid="aucun-etablissement">
          Aucun établissement ne vous est affecté. Contactez un administrateur.
        </p>
      )}

      {donnees && mois && issue ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
            <Kpi titre="Repas servis" valeur={String(donnees.kpi.servis)} brut={donnees.kpi.servis} icone={Utensils} testid="kpi-servis" variation={<Variation valeur={donnees.kpi.servisVariation} unite="%" />} note="vs période précédente" />
            <Kpi
              titre="Taux de présence"
              valeur={donnees.kpi.taux === null ? "—" : donnees.kpi.taux + " %"}
              brut={donnees.kpi.taux ?? ""}
              icone={Percent}
              testid="kpi-taux"
              variation={donnees.kpi.taux !== null && donnees.kpi.tauxPrec !== null ? <Variation valeur={donnees.kpi.taux - donnees.kpi.tauxPrec} unite="pts" /> : undefined}
              note={donnees.kpi.reserves + " réservés"}
            />
            <Kpi titre="Inscrits actifs" valeur={String(donnees.kpi.inscrits)} brut={donnees.kpi.inscrits} icone={Users} testid="kpi-inscrits" note="dans l'établissement" />
            {avecCout ? (
              <Kpi titre="Coût de production" valeur={formaterMontant(donnees.kpi.cout, devise)} brut={donnees.kpi.cout} icone={Coins} testid="kpi-cout" variation={<Variation valeur={donnees.kpi.coutVariation} unite="%" />} note="estimé sur les repas servis" />
            ) : (
              <Kpi titre="Hors réservation" valeur={String(donnees.kpi.horsReservation)} brut={donnees.kpi.horsReservation} icone={UserPlus} testid="kpi-hors" note="repas exceptionnels" />
            )}
          </div>

          {revenu ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis-argent">
              <Kpi titre="Revenu" valeur={formaterMontant(revenu.revenu, devise)} brut={revenu.revenu} icone={Wallet} testid="kpi-revenu" variation={<Variation valeur={revenu.variation} unite="%" />} note="caisse + repas sur comptes" />
              <Kpi titre="Ventes caisse" valeur={formaterMontant(revenu.caisse, devise)} brut={revenu.caisse} icone={ShoppingCart} testid="kpi-caisse" note={revenu.tickets + " ticket(s) payé(s)"} />
              <Kpi titre="Repas sur comptes" valeur={formaterMontant(revenu.repas, devise)} brut={revenu.repas} icone={Utensils} testid="kpi-repas-comptes" note="consommation hors caisse" />
              {recettes ? <Kpi titre="Encours des comptes" valeur={formaterMontant(recettes.encours, devise)} brut={recettes.encours} icone={PiggyBank} testid="kpi-encours" note={"Recharges : " + formaterMontant(recettes.recharges, devise)} /> : null}
            </div>
          ) : null}

          <Card data-testid="objectif-mois" data-cible={mois.cible} data-servis={mois.servis} data-prevision={mois.prevision}>
            <CardHeader>
              <CardTitle>Repas du mois vs réservations</CardTitle>
              <CardDescription className="capitalize">{mois.libelle}, du début du mois à aujourd&apos;hui</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Servis</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{NOMBRE.format(mois.servis)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Réservés ce mois</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{NOMBRE.format(mois.cible)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prévision</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{NOMBRE.format(mois.prevision)}</p>
                </div>
              </div>
              <BarreSegments pleins={pleins} prevus={prevus} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" data-testid="graphique-frequentation">
              <CardHeader>
                <CardTitle>Fréquentation</CardTitle>
                <CardDescription>Repas réservés et servis, jour par jour.</CardDescription>
              </CardHeader>
              <CardContent>
                <GraphiqueFrequentation data={donnees.serie.map((p) => ({ label: p.label, reserves: p.reserves, servis: p.servis }))} />
              </CardContent>
            </Card>
            <Card data-testid="graphique-services">
              <CardHeader>
                <CardTitle>Répartition par service</CardTitle>
                <CardDescription>Repas servis sur la période.</CardDescription>
              </CardHeader>
              <CardContent>
                {totalServices > 0 ? (
                  <GraphiqueServices data={donnees.services.filter((s) => s.servis > 0).map((s) => ({ service: s.service, label: s.label, value: s.servis }))} total={totalServices} />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">Aucun repas servi sur la période.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" data-testid="aujourdhui">
              <CardHeader>
                <CardTitle>Aujourd&apos;hui</CardTitle>
                <CardDescription>État de chaque service du jour.</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Service</th>
                      <th className="py-2 pr-4 font-medium">Menu</th>
                      <th className="py-2 pr-4 font-medium">Réservés</th>
                      <th className="py-2 pr-4 font-medium">Servis</th>
                      <th className="py-2 pr-4 font-medium">Restants</th>
                      <th className="w-40 py-2 font-medium">Avancement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donnees.aujourdhui.map((s) => (
                      <tr key={s.service} data-service={s.service} data-reserves={s.reserves} data-servis={s.servis} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={"/service?service=" + s.service} className="font-medium hover:underline">
                            {s.label}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={s.menu === "PUBLISHED" ? "secondary" : "outline"}>{s.menu === "PUBLISHED" ? "Publié" : s.menu === "DRAFT" ? "Brouillon" : "Aucun"}</Badge>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{s.reserves}</td>
                        <td className="py-2 pr-4 tabular-nums">{s.servis}</td>
                        <td className="py-2 pr-4 tabular-nums">{Math.max(s.reserves - s.servis, 0)}</td>
                        <td className="py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: (s.reserves > 0 ? Math.min(100, Math.round((s.servis * 100) / s.reserves)) : 0) + "%", background: "linear-gradient(90deg,#3b82f6,#1d4ed8)" }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Insights</CardTitle>
                <CardDescription>Ce qui mérite votre attention.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3 text-sm" data-testid="insights">
                  {insights.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {recettes && recettes.actif ? <CarteRecettes recettes={recettes} devise={devise} /> : null}

          <Card data-testid="graphique-reservations">
            <CardHeader>
              <CardTitle>Comment les réservations se terminent</CardTitle>
              <CardDescription>
                Réservations de chaque jour, du {libelleJourMois(issue.debut)} au {libelleJourMois(issue.fin)}, selon leur issue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
                <GraphiqueReservations data={issue.serie.map((p) => ({ label: p.label, servis: p.servis, annulees: p.annulees, absents: p.absents, avenir: p.avenir }))} />
                <div
                  className="flex flex-col gap-3 text-sm"
                  data-testid="fin-reservations"
                  data-places={issue.places}
                  data-servis={issue.servis}
                  data-annulees={issue.annulees}
                  data-absents={issue.absents}
                  data-avenir={issue.avenir}
                  data-hors={issue.horsReservation}
                >
                  <div className="flex items-baseline justify-between border-b pb-3">
                    <span className="font-semibold">Réservées</span>
                    <span className="text-2xl font-bold tabular-nums">{NOMBRE.format(issue.places)}</span>
                  </div>
                  {[
                    { nom: "Servis", n: issue.servis, couleur: "#26a77a" },
                    { nom: "Annulées", n: issue.annulees, couleur: "#e8a336" },
                    { nom: "Absents", n: issue.absents, couleur: "#e55b5b" },
                    { nom: "À venir", n: issue.avenir, couleur: "#6b7280" },
                  ].map((l) => (
                    <div key={l.nom} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: l.couleur }} />
                          {l.nom}
                        </span>
                        <span className="flex items-baseline gap-3">
                          <span className="font-semibold tabular-nums">{NOMBRE.format(l.n)}</span>
                          <span className="w-14 text-right text-muted-foreground tabular-nums">{pct(l.n, issue.places)}</span>
                        </span>
                      </div>
                      {l.nom === "Servis" ? (
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>dont hors réservation</span>
                          <span className="tabular-nums">{NOMBRE.format(issue.horsReservation)}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" data-testid="graphique-performance">
              <CardHeader>
                <CardTitle>Performance par service</CardTitle>
                <CardDescription>Repas réservés contre repas servis, par service.</CardDescription>
                <CardAction>
                  <Legende
                    items={[
                      { nom: "Réservés", couleur: "#60a5fa" },
                      { nom: "Servis", couleur: "#2563eb" },
                    ]}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <GraphiquePerformance data={donnees.services.map((s) => ({ label: s.label, reserves: s.reserves, servis: s.servis }))} />
              </CardContent>
            </Card>
            <Card data-testid="menus-semaine" data-publies={donnees.menus.publies} data-brouillons={donnees.menus.brouillons} data-manquants={donnees.menus.manquants}>
              <CardHeader>
                <CardTitle>Menus des 7 prochains jours</CardTitle>
                <CardDescription>{donnees.menus.total} créneaux : de la préparation à la publication.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {[
                  { nom: "Publiés", n: donnees.menus.publies, classe: "bg-emerald-500" },
                  { nom: "En brouillon", n: donnees.menus.brouillons, classe: "bg-amber-500" },
                  { nom: "Sans menu", n: donnees.menus.manquants - donnees.menus.brouillons, classe: "bg-muted-foreground/40" },
                ].map((e) => (
                  <div key={e.nom} className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span>{e.nom}</span>
                      <span className="font-medium tabular-nums">{e.n}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={"h-full rounded-full " + e.classe} style={{ width: Math.round((e.n * 100) / donnees.menus.total) + "%" }} />
                    </div>
                  </div>
                ))}
                <Link href="/menus" className="text-xs text-muted-foreground hover:underline">
                  Ouvrir le planning →
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Classement des groupes</CardTitle>
              <CardDescription>Groupes qui mangent le plus à la cantine sur la période.</CardDescription>
            </CardHeader>
            <CardContent>
              {donnees.groupes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun repas servi par un groupe sur la période.</p>
              ) : (
                <ol className="flex flex-col gap-3 text-sm" data-testid="top-groupes">
                  {donnees.groupes.map((g, i) => (
                    <li key={g.nom} data-groupe={g.nom} data-servis={g.servis} className="flex items-center gap-3">
                      <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="w-40 truncate font-medium">{g.nom}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: Math.round((g.servis * 100) / maxGroupe) + "%" }} />
                      </div>
                      <span className="w-12 text-right tabular-nums">{g.servis}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="aucun-module">
          Aucun module n&apos;est encore ouvert pour votre rôle.
        </p>
      ) : (
        <>
          {donnees ? <h3 className="text-sm font-medium text-muted-foreground">Accès rapide</h3> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="modules">
            {modules.map((m) => (
              <Link key={m.url} href={m.url}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <m.icon className="mb-2 size-5 text-muted-foreground" />
                    <CardTitle>{m.title}</CardTitle>
                    <CardDescription>{m.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}