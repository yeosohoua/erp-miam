import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { aujourdhui, versDate, versIso } from "@/lib/menus"
import { accesPersonnel } from "@/lib/personnel-acces"
import { LIBELLES_CERTIFICATION, LIBELLES_CONGE, LIBELLES_POINTAGE, formaterJours, joursAvant, soldeConges, statutCertification, type TypeCertificationCle, type TypeCongeCle, type StatutPointageCle } from "@/lib/rh-avance-base"

import { approuverConge, refuserConge, supprimerCertification } from "./actions"
import { FormCertification, FormConge, FormPointage, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { conges: "Congés", presences: "Présences", certifications: "Certifications" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const fr = (iso: string): string => iso.split("-").reverse().join("/")
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2"
const STATUT_CONGE: Record<string, string> = { DEMANDE: "En attente", APPROUVE: "Approuvé", REFUSE: "Refusé" }
const STATUT_CERT: Record<string, string> = { VALIDE: "Valide", BIENTOT: "Expire bientôt", EXPIREE: "Expirée" }

type EmployeLite = { id: string; matricule: string; firstName: string; lastName: string; dateEmbauche: Date; actif: boolean }
type Nom = { matricule: string; firstName: string; lastName: string }
const nomComplet = (e: Nom): string => e.matricule + " — " + e.lastName + " " + e.firstName

function Kpi({ nom, titre, valeur }: { nom: string; titre: string; valeur: string }) {
  return (
    <div data-kpi={nom} className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="text-2xl font-semibold">{valeur}</p>
    </div>
  )
}

export async function PersonnelView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesPersonnel()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction, aux ressources humaines et à la comptabilité.
      </p>
    )
  }
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "conges"
  const jour = aujourdhui()
  const employes = await db.employeRh.findMany({ where: { etablissementId: etab.id }, orderBy: { matricule: "asc" } })
  const options: Option[] = employes.filter((e) => e.actif).map((e) => ({ value: e.id, label: nomComplet(e) }))

  return (
    <div className="flex flex-col gap-6" data-testid="personnel-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Congés et présences</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — congés, pointage et certifications du personnel</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="personnel-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/personnel?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "conges" ? await Conges({ etabId: etab.id, ecriture, jour, employes, options }) : null}
      {vue === "presences" ? await Presences({ etabId: etab.id, ecriture, jour, employes, options }) : null}
      {vue === "certifications" ? await Certifications({ etabId: etab.id, ecriture, jour, options }) : null}
    </div>
  )
}

type Props = { etabId: string; ecriture: boolean; jour: string; employes: EmployeLite[]; options: Option[] }

async function Conges({ etabId, ecriture, jour, employes, options }: Props) {
  const [conges, tous] = await Promise.all([
    db.conge.findMany({ where: { etablissementId: etabId }, orderBy: { debut: "desc" }, take: 200, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } } }),
    db.conge.findMany({ where: { etablissementId: etabId }, select: { employeId: true, type: true, statut: true, jours: true }, take: 5000 }),
  ])
  const enAttente = conges.filter((c) => c.statut === "DEMANDE").length
  const enCours = conges.filter((c) => c.statut === "APPROUVE" && versIso(c.debut) <= jour && versIso(c.fin) >= jour).length
  const actifs = employes.filter((e) => e.actif)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="conges-attente" titre="Demandes en attente" valeur={String(enAttente)} />
        <Kpi nom="conges-en-cours" titre="Absents en congé aujourd'hui" valeur={String(enCours)} />
        <Kpi nom="employes-actifs" titre="Employés actifs" valeur={String(actifs.length)} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle demande de congé</CardTitle>
            <CardDescription>Les jours ouvrables vont du lundi au samedi. Le congé annuel est limité au solde acquis (2,2 jours par mois complet de service).</CardDescription>
          </CardHeader>
          <CardContent>
            <FormConge employes={options} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Demandes et congés</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="conges">
            <thead>
              <tr className="border-b">
                <th className={th}>Employé</th>
                <th className={th}>Type</th>
                <th className={th}>Période</th>
                <th className={th}>Jours</th>
                <th className={th}>Statut</th>
                <th className={th}>Motif</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {conges.length === 0 ? (
                <tr>
                  <td colSpan={7} className={td + " text-muted-foreground"}>
                    Aucun congé enregistré.
                  </td>
                </tr>
              ) : null}
              {conges.map((c) => (
                <tr key={c.id} data-conge={c.id} data-matricule={c.employe.matricule} data-statut={c.statut} className="border-b">
                  <td className={td}>{nomComplet(c.employe)}</td>
                  <td className={td}>{LIBELLES_CONGE[c.type as TypeCongeCle]}</td>
                  <td className={td}>
                    {fr(versIso(c.debut))} au {fr(versIso(c.fin))}
                  </td>
                  <td className={td}>{c.jours}</td>
                  <td className={td}>{STATUT_CONGE[c.statut]}</td>
                  <td className={td}>{c.motif ?? ""}</td>
                  <td className={td}>
                    {ecriture && c.statut === "DEMANDE" ? (
                      <div className="flex gap-2">
                        <form action={approuverConge.bind(null, c.id)}>
                          <Button type="submit" size="sm">
                            Approuver
                          </Button>
                        </form>
                        <form action={refuserConge.bind(null, c.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Refuser
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Soldes de congé annuel</CardTitle>
          <CardDescription>Cumul depuis l&apos;embauche, en jours. Les demandes en attente réservent des jours.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="soldes">
            <thead>
              <tr className="border-b">
                <th className={th}>Employé</th>
                <th className={th}>Acquis</th>
                <th className={th}>Pris</th>
                <th className={th}>En attente</th>
                <th className={th}>Disponible</th>
              </tr>
            </thead>
            <tbody>
              {actifs.map((e) => {
                const s = soldeConges(versIso(e.dateEmbauche), jour, tous.filter((c) => c.employeId === e.id))
                return (
                  <tr key={e.id} data-solde={e.id} data-matricule={e.matricule} data-disponible={s.disponible} className="border-b">
                    <td className={td}>{nomComplet(e)}</td>
                    <td className={td}>{formaterJours(s.acquis)}</td>
                    <td className={td}>{formaterJours(s.pris)}</td>
                    <td className={td}>{formaterJours(s.enAttente)}</td>
                    <td className={td + " font-medium"}>{formaterJours(s.disponible)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Presences({ etabId, ecriture, jour, employes, options }: Props) {
  const mois = jour.slice(0, 7)
  const [dumois, recents] = await Promise.all([
    db.pointage.findMany({ where: { etablissementId: etabId, date: { gte: versDate(mois + "-01"), lte: versDate(jour) } }, select: { employeId: true, date: true, statut: true, minutesRetard: true } }),
    db.pointage.findMany({ where: { etablissementId: etabId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 30, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } } }),
  ])
  const presents = dumois.filter((p) => versIso(p.date) === jour && p.statut !== "ABSENT").length
  const absents = dumois.filter((p) => versIso(p.date) === jour && p.statut === "ABSENT").length
  const retards = dumois.reduce((s, p) => s + p.minutesRetard, 0)
  const actifs = employes.filter((e) => e.actif)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="presents-jour" titre="Présents aujourd'hui" valeur={String(presents)} />
        <Kpi nom="absents-jour" titre="Absents aujourd'hui" valeur={String(absents)} />
        <Kpi nom="retards-mois" titre="Minutes de retard ce mois" valeur={String(retards)} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Pointage</CardTitle>
            <CardDescription>Un seul pointage par employé et par jour : enregistrer à nouveau remplace le précédent.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormPointage employes={options} jour={jour} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Synthèse du mois</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="presences">
            <thead>
              <tr className="border-b">
                <th className={th}>Employé</th>
                <th className={th}>Présences</th>
                <th className={th}>Retards</th>
                <th className={th}>Absences</th>
                <th className={th}>Minutes de retard</th>
              </tr>
            </thead>
            <tbody>
              {actifs.map((e) => {
                const mes = dumois.filter((p) => p.employeId === e.id)
                const nb = (s: string): number => mes.filter((p) => p.statut === s).length
                return (
                  <tr key={e.id} data-presence={e.id} data-matricule={e.matricule} data-present={nb("PRESENT")} data-retard={nb("RETARD")} data-absent={nb("ABSENT")} className="border-b">
                    <td className={td}>{nomComplet(e)}</td>
                    <td className={td}>{nb("PRESENT")}</td>
                    <td className={td}>{nb("RETARD")}</td>
                    <td className={td}>{nb("ABSENT")}</td>
                    <td className={td}>{mes.reduce((s, p) => s + p.minutesRetard, 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Derniers pointages</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="pointages">
            <thead>
              <tr className="border-b">
                <th className={th}>Date</th>
                <th className={th}>Employé</th>
                <th className={th}>Statut</th>
                <th className={th}>Retard</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {recents.length === 0 ? (
                <tr>
                  <td colSpan={5} className={td + " text-muted-foreground"}>
                    Aucun pointage enregistré.
                  </td>
                </tr>
              ) : null}
              {recents.map((p) => (
                <tr key={p.id} data-pointage={p.id} data-matricule={p.employe.matricule} data-date={versIso(p.date)} data-statut={p.statut} className="border-b">
                  <td className={td}>{fr(versIso(p.date))}</td>
                  <td className={td}>{nomComplet(p.employe)}</td>
                  <td className={td}>{LIBELLES_POINTAGE[p.statut as StatutPointageCle]}</td>
                  <td className={td}>{p.minutesRetard > 0 ? p.minutesRetard + " min" : ""}</td>
                  <td className={td}>{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Certifications({ etabId, ecriture, jour, options }: { etabId: string; ecriture: boolean; jour: string; options: Option[] }) {
  const certs = await db.certification.findMany({ where: { etablissementId: etabId }, orderBy: [{ expireLe: "asc" }], take: 500, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } } })
  const lignes = certs.map((c) => ({ c, statut: statutCertification(versIso(c.expireLe), jour), reste: joursAvant(versIso(c.expireLe), jour) }))
  const compte = (s: string): number => lignes.filter((l) => l.statut === s).length
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi nom="cert-expirees" titre="Certifications expirées" valeur={String(compte("EXPIREE"))} />
        <Kpi nom="cert-bientot" titre="Expirent bientôt" valeur={String(compte("BIENTOT"))} />
        <Kpi nom="cert-valides" titre="Certifications valides" valeur={String(compte("VALIDE"))} />
      </div>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle certification</CardTitle>
            <CardDescription>Visite médicale, formation hygiène, HACCP, premiers secours. Une alerte apparaît dans les deux mois qui précèdent l&apos;expiration.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormCertification employes={options} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Certifications du personnel</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="certifications">
            <thead>
              <tr className="border-b">
                <th className={th}>Employé</th>
                <th className={th}>Type</th>
                <th className={th}>Délivrée le</th>
                <th className={th}>Expire le</th>
                <th className={th}>Statut</th>
                <th className={th}>Organisme</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={7} className={td + " text-muted-foreground"}>
                    Aucune certification enregistrée.
                  </td>
                </tr>
              ) : null}
              {lignes.map(({ c, statut, reste }) => (
                <tr key={c.id} data-certification={c.id} data-matricule={c.employe.matricule} data-type={c.type} data-statut={statut} className="border-b">
                  <td className={td}>{nomComplet(c.employe)}</td>
                  <td className={td}>{LIBELLES_CERTIFICATION[c.type as TypeCertificationCle]}</td>
                  <td className={td}>{fr(versIso(c.delivreeLe))}</td>
                  <td className={td}>{fr(versIso(c.expireLe))}</td>
                  <td className={td}>
                    {STATUT_CERT[statut]}
                    {statut === "BIENTOT" && reste !== null ? " (dans " + reste + " j)" : ""}
                  </td>
                  <td className={td}>{c.organisme ?? ""}</td>
                  <td className={td}>
                    {ecriture ? (
                      <form action={supprimerCertification.bind(null, c.id)}>
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