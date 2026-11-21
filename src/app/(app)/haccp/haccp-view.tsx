import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { FREQUENCES, GRAVITES, LIBELLES_FREQUENCE, LIBELLES_GRAVITE, LIBELLES_STATUT_NC, LIBELLES_TYPE, TYPES_EQUIPEMENT, bilanReleves, resumerRappel, tacheFaite, type GraviteCle, type StatutNCCle, type TypeEquipementCle } from "@/lib/haccp-base"
import { accesHaccp } from "@/lib/haccp-acces"
import { ajouterJours, aujourdhui, versDate } from "@/lib/menus"

import { basculerEquipement, basculerTache, cloturerNonConformite, jeterTemoin, validerTache } from "./actions"
import { FormCorrection, FormEquipement, FormNc, FormReleve, FormTache, FormTemoin, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { temperatures: "Températures", hygiene: "Hygiène", nc: "Non-conformités", temoins: "Échantillons témoins", tracabilite: "Traçabilité des lots" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const fr = (iso: string): string => iso.split("-").reverse().join("/")
const heure = (d: Date): string => d.toISOString().slice(0, 16).replace("T", " ")
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

export async function HaccpView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesHaccp()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, à la cuisine et au magasin.
      </p>
    )
  }
  const { etab, ecriture, admin } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "temperatures"
  return (
    <div className="flex flex-col gap-6" data-testid="haccp-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Hygiène et traçabilité</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — contrôles HACCP, non-conformités et rappel de lots</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="haccp-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/haccp?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "temperatures" ? await Temperatures({ etabId: etab.id, ecriture, admin }) : null}
      {vue === "hygiene" ? await Hygiene({ etabId: etab.id, ecriture, admin }) : null}
      {vue === "nc" ? await NonConformites({ etabId: etab.id, ecriture, admin }) : null}
      {vue === "temoins" ? await Temoins({ etabId: etab.id, ecriture }) : null}
      {vue === "tracabilite" ? await Tracabilite({ etabId: etab.id, q: un(sp.lot).trim() }) : null}
    </div>
  )
}

async function Temperatures({ etabId, ecriture, admin }: { etabId: string; ecriture: boolean; admin: boolean }) {
  const depuis = new Date(Date.now() - 7 * 864e5)
  const [equipements, recents, semaine, ouvertes] = await Promise.all([
    db.equipement.findMany({ where: { etablissementId: etabId }, orderBy: { nom: "asc" }, include: { releves: { orderBy: { mesureLe: "desc" }, take: 1 } } }),
    db.releveTemperature.findMany({ where: { etablissementId: etabId }, orderBy: { mesureLe: "desc" }, take: 15, include: { equipement: { select: { nom: true } } } }),
    db.releveTemperature.findMany({ where: { etablissementId: etabId, mesureLe: { gte: depuis } }, select: { conforme: true } }),
    db.nonConformite.count({ where: { etablissementId: etabId, statut: "OUVERTE" } }),
  ])
  const bilan = bilanReleves(semaine)
  const actifs = equipements.filter((e) => e.actif)
  const options: Option[] = actifs.map((e) => ({ value: e.id, label: e.nom + " (" + Number(e.tempMin) + " à " + Number(e.tempMax) + " °C)" }))
  const types: Option[] = TYPES_EQUIPEMENT.map((t) => ({ value: t, label: LIBELLES_TYPE[t] }))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi nom="equip-actifs" titre="Équipements suivis" valeur={String(actifs.length)} />
        <Kpi nom="releves-total" titre="Relevés des sept derniers jours" valeur={String(bilan.total)} />
        <Kpi nom="releves-taux" titre="Relevés conformes" valeur={bilan.taux === null ? "—" : bilan.taux + " %"} />
        <Kpi nom="nc-ouvertes" titre="Non-conformités ouvertes" valeur={String(ouvertes)} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Saisir un relevé</CardTitle>
            <CardDescription>Un relevé hors plage ouvre automatiquement une non-conformité.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormReleve equipements={options} />
          </CardContent>
        </Card>
      ) : null}
      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter un équipement</CardTitle>
            <CardDescription>Plages usuelles : réfrigérateur 0 à 4 °C, congélateur -25 à -18 °C, bain-marie 63 à 90 °C.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormEquipement types={types} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Équipements</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-equipements">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Équipement</th>
                <th className={th}>Type</th>
                <th className={th}>Plage</th>
                <th className={th}>Dernier relevé</th>
                <th className={th}>Statut</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {equipements.map((e) => {
                const r = e.releves[0]
                return (
                  <tr key={e.id} data-equipement={e.nom} className="border-b last:border-0">
                    <td className={td}>{e.nom}</td>
                    <td className={td}>{LIBELLES_TYPE[e.type as TypeEquipementCle]}</td>
                    <td className={td}>{Number(e.tempMin)} à {Number(e.tempMax)} °C</td>
                    <td className={td}>{r ? Number(r.valeur) + " °C · " + (r.conforme ? "conforme" : "hors plage") + " · " + heure(r.mesureLe) : "Aucun relevé"}</td>
                    <td className={td}>{e.actif ? "Actif" : "Désactivé"}</td>
                    <td className={td}>
                      {admin ? (
                        <form action={basculerEquipement.bind(null, e.id)}>
                          <Button type="submit" variant="outline" size="sm">{e.actif ? "Désactiver" : "Réactiver"}</Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {equipements.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={6}>Aucun équipement.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Derniers relevés</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-releves">
            <tbody>
              {recents.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={td}>{heure(r.mesureLe)}</td>
                  <td className={td}>{r.equipement.nom}</td>
                  <td className={td}>{Number(r.valeur)} °C</td>
                  <td className={td}>{r.conforme ? "Conforme" : "Hors plage"}</td>
                  <td className={td + " text-muted-foreground"}>{r.action ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Hygiene({ etabId, ecriture, admin }: { etabId: string; ecriture: boolean; admin: boolean }) {
  const jour = aujourdhui()
  const [taches, executions] = await Promise.all([
    db.tacheHygiene.findMany({ where: { etablissementId: etabId }, orderBy: [{ frequence: "asc" }, { nom: "asc" }] }),
    db.executionHygiene.findMany({ where: { etablissementId: etabId, date: { gte: versDate(ajouterJours(jour, -7)) } }, select: { tacheId: true, date: true } }),
  ])
  const dates = new Map<string, string[]>()
  for (const x of executions) dates.set(x.tacheId, [...(dates.get(x.tacheId) ?? []), x.date.toISOString().slice(0, 10)])
  const actives = taches.filter((t) => t.actif)
  const faites = actives.filter((t) => tacheFaite(t.frequence, jour, dates.get(t.id) ?? []))
  const frequences: Option[] = FREQUENCES.map((f) => ({ value: f, label: LIBELLES_FREQUENCE[f] }))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="taches-actives" titre="Tâches actives" valeur={String(actives.length)} />
        <Kpi nom="taches-faites" titre="Tâches à jour" valeur={String(faites.length)} />
        <Kpi nom="taches-restantes" titre="Tâches à faire" valeur={String(actives.length - faites.length)} />
      </div>
      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une tâche d&apos;hygiène</CardTitle>
          </CardHeader>
          <CardContent>
            <FormTache frequences={frequences} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Plan de nettoyage</CardTitle>
          <CardDescription>Les tâches quotidiennes sont à faire chaque jour, les hebdomadaires une fois par semaine.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-taches">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Tâche</th>
                <th className={th}>Fréquence</th>
                <th className={th}>Zone</th>
                <th className={th}>État</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {taches.map((t) => {
                const fait = tacheFaite(t.frequence, jour, dates.get(t.id) ?? [])
                return (
                  <tr key={t.id} data-tache={t.nom} className="border-b last:border-0">
                    <td className={td}>{t.nom}</td>
                    <td className={td}>{LIBELLES_FREQUENCE[t.frequence as keyof typeof LIBELLES_FREQUENCE]}</td>
                    <td className={td}>{t.zone ?? "—"}</td>
                    <td className={td}>{!t.actif ? "Désactivée" : fait ? "Fait" : "À faire"}</td>
                    <td className={td}>
                      <div className="flex gap-2">
                        {ecriture && t.actif && !fait ? (
                          <form action={validerTache.bind(null, t.id)}>
                            <Button type="submit" size="sm">Marquer fait</Button>
                          </form>
                        ) : null}
                        {admin ? (
                          <form action={basculerTache.bind(null, t.id)}>
                            <Button type="submit" variant="outline" size="sm">{t.actif ? "Désactiver" : "Réactiver"}</Button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {taches.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={5}>Aucune tâche.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function NonConformites({ etabId, ecriture, admin }: { etabId: string; ecriture: boolean; admin: boolean }) {
  const liste = await db.nonConformite.findMany({ where: { etablissementId: etabId }, orderBy: { createdAt: "desc" }, take: 100 })
  const gravites: Option[] = GRAVITES.map((g) => ({ value: g, label: LIBELLES_GRAVITE[g] }))
  const nb = (s: string) => liste.filter((n) => n.statut === s).length
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="nc-liste-ouvertes" titre="Ouvertes" valeur={String(nb("OUVERTE"))} />
        <Kpi nom="nc-liste-corrigees" titre="Corrigées, à clôturer" valeur={String(nb("CORRIGEE"))} />
        <Kpi nom="nc-liste-cloturees" titre="Clôturées" valeur={String(nb("CLOTUREE"))} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Déclarer une non-conformité</CardTitle>
          </CardHeader>
          <CardContent>
            <FormNc gravites={gravites} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Registre des non-conformités</CardTitle>
          <CardDescription>Une non-conformité est d&apos;abord corrigée, puis clôturée par l&apos;administration.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-nc">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Non-conformité</th>
                <th className={th}>Gravité</th>
                <th className={th}>Statut</th>
                <th className={th}>Action corrective</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((n) => (
                <tr key={n.id} data-nc={n.titre} className="border-b align-top last:border-0">
                  <td className={td}>{fr(n.createdAt.toISOString().slice(0, 10))}</td>
                  <td className={td}>
                    {n.titre}
                    {n.detail ? <span className="block text-xs text-muted-foreground">{n.detail}</span> : null}
                  </td>
                  <td className={td}>{LIBELLES_GRAVITE[n.gravite as GraviteCle]}</td>
                  <td className={td}>{LIBELLES_STATUT_NC[n.statut as StatutNCCle]}</td>
                  <td className={td}>{n.actionCorrective ?? "—"}</td>
                  <td className={td}>
                    {ecriture && n.statut === "OUVERTE" ? <FormCorrection id={n.id} /> : null}
                    {admin && n.statut === "CORRIGEE" ? (
                      <form action={cloturerNonConformite.bind(null, n.id)}>
                        <Button type="submit" size="sm">Clôturer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {liste.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={6}>Aucune non-conformité.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Temoins({ etabId, ecriture }: { etabId: string; ecriture: boolean }) {
  const jour = aujourdhui()
  const liste = await db.echantillonTemoin.findMany({ where: { etablissementId: etabId, date: { gte: versDate(ajouterJours(jour, -60)) } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 })
  const services: Option[] = Object.entries(SERVICES).map(([value, label]) => ({ value, label }))
  return (
    <>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Enregistrer un échantillon témoin</CardTitle>
            <CardDescription>Un échantillon de chaque plat est conservé cinq jours au froid pour toute enquête sanitaire.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormTemoin services={services} jour={jour} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Échantillons des soixante derniers jours</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-temoins">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Repas</th>
                <th className={th}>Plat</th>
                <th className={th}>Emplacement</th>
                <th className={th}>Conservé jusqu&apos;au</th>
                <th className={th}>État</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((x) => {
                const fin = x.conserveJusqu.toISOString().slice(0, 10)
                const etat = x.jete ? "Jeté" : jour < fin ? "À conserver" : "À jeter"
                return (
                  <tr key={x.id} data-temoin={x.platNom} className="border-b last:border-0">
                    <td className={td}>{fr(x.date.toISOString().slice(0, 10))} · {SERVICES[x.service] ?? x.service}</td>
                    <td className={td}>{x.platNom}</td>
                    <td className={td}>{x.emplacement ?? "—"}</td>
                    <td className={td}>{fr(fin)}</td>
                    <td className={td}>{etat}</td>
                    <td className={td}>
                      {ecriture && etat === "À jeter" ? (
                        <form action={jeterTemoin.bind(null, x.id)}>
                          <Button type="submit" size="sm">Marquer jeté</Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {liste.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={6}>Aucun échantillon.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Tracabilite({ etabId, q }: { etabId: string; q: string }) {
  const lots =
    q.length >= 2
      ? await db.lot.findMany({ where: { etablissementId: etabId, reference: { contains: q, mode: "insensitive" } }, orderBy: { recuLe: "desc" }, take: 10, include: { ingredient: { select: { name: true, unit: true } } } })
      : []
  const details = await Promise.all(
    lots.map(async (lot) => {
      const mv = await db.mouvementStock.findMany({ where: { etablissementId: etabId, lotId: lot.id, type: "SORTIE", consommationId: { not: null } }, select: { consommationId: true, quantite: true } })
      const ids = Array.from(new Set(mv.map((m) => m.consommationId).filter((x): x is string => x !== null)))
      const cs = ids.length > 0 ? await db.consommation.findMany({ where: { id: { in: ids }, etablissementId: etabId }, orderBy: { date: "desc" } }) : []
      const lignes = cs.map((c) => ({
        date: c.date.toISOString().slice(0, 10),
        service: c.service as string,
        repas: c.repas,
        quantite: mv.filter((m) => m.consommationId === c.id).reduce((s, m) => s + Math.abs(Number(m.quantite)), 0),
      }))
      return { lot, lignes, resume: resumerRappel(lignes) }
    }),
  )
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Retrouver un lot</CardTitle>
          <CardDescription>Saisissez tout ou partie de la référence du lot : vous verrez les services où il a été utilisé, en cas de rappel produit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" action="/haccp" data-testid="form-tracabilite" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="vue" value="tracabilite" />
            <label className="flex flex-col gap-1 text-sm">
              Référence du lot
              <input id="tr-lot" name="lot" defaultValue={q} className={champ} />
            </label>
            <Button type="submit">Rechercher</Button>
          </form>
        </CardContent>
      </Card>
      {q.length >= 2 ? (
        <div className="flex flex-col gap-4" data-testid="resultat-tracabilite">
          {details.length === 0 ? <p className="text-sm text-muted-foreground">Aucun lot ne correspond à cette référence.</p> : null}
          {details.map(({ lot, lignes, resume }) => (
            <Card key={lot.id} data-lot={lot.reference}>
              <CardHeader>
                <CardTitle>{lot.reference} — {lot.ingredient.name}</CardTitle>
                <CardDescription>
                  Reçu le {fr(lot.recuLe.toISOString().slice(0, 10))} · quantité reçue {Number(lot.quantite)} {lot.ingredient.unit} · restante {Number(lot.restante)} {lot.ingredient.unit}
                  {lot.peremption ? " · péremption " + fr(lot.peremption.toISOString().slice(0, 10)) : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm font-medium" data-testid="resume-rappel">
                  {resume.nbServices} service(s) concerné(s) · {resume.repas} repas
                  {resume.premier && resume.dernier ? " · du " + fr(resume.premier) + " au " + fr(resume.dernier) : ""}
                </p>
                {lignes.length > 0 ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.date + l.service} className="border-b last:border-0">
                          <td className={td}>{fr(l.date)}</td>
                          <td className={td}>{SERVICES[l.service] ?? l.service}</td>
                          <td className={td}>{l.repas} repas</td>
                          <td className={td}>{Math.round(l.quantite * 1000) / 1000} {lot.ingredient.unit} utilisés</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">Ce lot n&apos;a pas encore été utilisé dans un service.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  )
}