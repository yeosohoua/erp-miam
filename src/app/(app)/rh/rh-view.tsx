import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { libellePeriode } from "@/lib/facturation-base"
import { aujourdhui, formaterMontant, versIso } from "@/lib/menus"
import { chargerParams } from "@/lib/paie"
import { accesPaie } from "@/lib/paie-acces"
import { SITUATIONS } from "@/lib/paie-base"

import { basculerActif, creerEmploye, enregistrerParametres, genererAction, modifierEmploye, supprimerBrouillon, validerAction } from "./actions"
import { EmployeFormulaire, ParametresFormulaire, PeriodeFormulaire } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const VUES = { employes: "Employés", bulletins: "Bulletins", parametres: "Paramètres de paie" } as const
type Vue = keyof typeof VUES
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const pct = (bp: number): string => (bp / 100).toFixed(2)

export async function RhView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesPaie()
  if (!acces) redirect("/")
  const { etab, ecriture, validation } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, demande) ? (demande as Vue) : "employes"
  const jour = aujourdhui()
  const devise = (await db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }))?.currency ?? "XOF"
  const m = (n: number): string => formaterMontant(n, devise)

  return (
    <div className="flex flex-col gap-6" data-testid="rh-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">RH et paie</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — Côte d&apos;Ivoire (CNPS, ITS, CMU)</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="rh-onglets">
          {(Object.keys(VUES) as Vue[]).map((k) => (
            <Link key={k} href={"/rh?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {VUES[k]}
            </Link>
          ))}
        </nav>
      </div>

      {vue === "employes" ? await Employes({ etabId: etab.id, ecriture, jour, edit: un(sp.edit), m }) : null}
      {vue === "bulletins" ? await Bulletins({ etabId: etab.id, ecriture, validation, jour, periode: un(sp.periode), m }) : null}
      {vue === "parametres" ? await Parametres({ etabId: etab.id, validation }) : null}
    </div>
  )
}

async function Employes({ etabId, ecriture, jour, edit, m }: { etabId: string; ecriture: boolean; jour: string; edit: string; m: (n: number) => string }) {
  const employes = await db.employeRh.findMany({ where: { etablissementId: etabId }, orderBy: { matricule: "asc" } })
  const edition = ecriture ? employes.find((e) => e.id === edit) : undefined
  return (
    <>
      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>{edition ? "Modifier " + edition.matricule : "Nouvel employé"}</CardTitle>
            <CardDescription>
              Salaire de base et primes forment le brut. L&apos;indemnité exonérée (transport, logement dans les limites légales) est retirée de la base de l&apos;ITS.
              {edition ? (
                <>
                  {" "}
                  <Link href="/rh?vue=employes" className="underline">
                    Annuler la modification
                  </Link>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeFormulaire
              key={edition?.id ?? "nouveau"}
              action={edition ? modifierEmploye.bind(null, edition.id) : creerEmploye}
              aujourdhui={jour}
              employe={
                edition
                  ? {
                      matricule: edition.matricule,
                      firstName: edition.firstName,
                      lastName: edition.lastName,
                      poste: edition.poste ?? "",
                      dateEmbauche: versIso(edition.dateEmbauche),
                      salaireBase: edition.salaireBase,
                      primes: edition.primes,
                      indemniteExoneree: edition.indemniteExoneree,
                      situation: edition.situation,
                      enfants: edition.enfants,
                      personnesCmu: edition.personnesCmu,
                      telephone: edition.telephone ?? "",
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Personnel</CardTitle>
          <CardDescription>{employes.length} employé(s) enregistré(s).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="employes">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Matricule</th>
                <th className="pr-3">Nom</th>
                <th className="pr-3">Poste</th>
                <th className="pr-3">Embauche</th>
                <th className="pr-3 text-right">Brut mensuel</th>
                <th className="pr-3">Famille</th>
                <th className="pr-3">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-muted-foreground">
                    Aucun employé pour le moment.
                  </td>
                </tr>
              ) : null}
              {employes.map((e) => (
                <tr key={e.id} className="border-b last:border-0" data-employe={e.id} data-matricule={e.matricule} data-actif={e.actif ? "1" : "0"}>
                  <td className="py-2 pr-3 font-medium">{e.matricule}</td>
                  <td className="pr-3">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="pr-3">{e.poste ?? "—"}</td>
                  <td className="pr-3">{versIso(e.dateEmbauche)}</td>
                  <td className="pr-3 text-right tabular-nums">{m(e.salaireBase + e.primes)}</td>
                  <td className="pr-3">
                    {SITUATIONS[e.situation]}, {e.enfants} enfant(s)
                  </td>
                  <td className="pr-3">
                    <Badge variant={e.actif ? "default" : "outline"}>{e.actif ? "Actif" : "Inactif"}</Badge>
                  </td>
                  <td className="flex items-center gap-2 py-2">
                    {ecriture ? (
                      <>
                        <Link href={"/rh?vue=employes&edit=" + e.id} className="text-muted-foreground hover:underline">
                          Modifier
                        </Link>
                        <form action={basculerActif.bind(null, e.id)}>
                          <Button type="submit" size="sm" variant="ghost">
                            {e.actif ? "Désactiver" : "Réactiver"}
                          </Button>
                        </form>
                      </>
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

async function Bulletins({ etabId, ecriture, validation, jour, periode, m }: { etabId: string; ecriture: boolean; validation: boolean; jour: string; periode: string; m: (n: number) => string }) {
  const p = /^\d{4}-(0[1-9]|1[0-2])$/.test(periode) ? periode : jour.slice(0, 7)
  const bulletins = await db.bulletinPaie.findMany({ where: { etablissementId: etabId, periode: p }, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } }, orderBy: { employe: { matricule: "asc" } } })
  const tot = bulletins.reduce((s, b) => ({ brut: s.brut + b.brut, its: s.its + b.its, net: s.net + b.net, cout: s.cout + b.coutEmployeur }), { brut: 0, its: 0, net: 0, cout: 0 })
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {ecriture ? (
          <Card>
            <CardHeader>
              <CardTitle>Générer les bulletins</CardTitle>
              <CardDescription>Crée ou recalcule les brouillons du mois pour les employés actifs. Un bulletin validé n&apos;est jamais modifié.</CardDescription>
            </CardHeader>
            <CardContent>
              <PeriodeFormulaire action={genererAction} defaut={p} bouton="Générer / recalculer" testid="form-generer" id="gen-periode" />
            </CardContent>
          </Card>
        ) : null}
        {validation ? (
          <Card>
            <CardHeader>
              <CardTitle>Valider la paie du mois</CardTitle>
              <CardDescription>Les bulletins validés deviennent définitifs et sont comptabilisés (661, 664, 641 / 421, 431, 447).</CardDescription>
            </CardHeader>
            <CardContent>
              <PeriodeFormulaire action={validerAction} defaut={p} bouton="Valider les bulletins" testid="form-valider" id="val-periode" />
            </CardContent>
          </Card>
        ) : null}
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <div>
            <CardTitle>Bulletins — {libellePeriode(p)}</CardTitle>
            <CardDescription>
              {bulletins.length} bulletin(s).{" "}
              {bulletins.length > 0 ? (
                <a href={"/api/rh/livre-paie?periode=" + p} className="underline" data-testid="lien-livre-paie">
                  Exporter le livre de paie (CSV)
                </a>
              ) : null}
            </CardDescription>
          </div>
          <form action="/rh" method="get" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="vue" value="bulletins" />
            <input type="month" name="periode" defaultValue={p} className="h-9 rounded-md border bg-background px-2" />
            <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
              Afficher
            </button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="bulletins">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Employé</th>
                <th className="pr-3 text-right">Brut</th>
                <th className="pr-3 text-right">ITS</th>
                <th className="pr-3 text-right">Net à payer</th>
                <th className="pr-3 text-right">Coût employeur</th>
                <th className="pr-3">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bulletins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-muted-foreground">
                    Aucun bulletin pour ce mois.
                  </td>
                </tr>
              ) : null}
              {bulletins.map((b) => (
                <tr key={b.id} className="border-b last:border-0" data-bulletin={b.id} data-matricule={b.employe.matricule} data-statut={b.statut} data-brut={b.brut} data-its={b.its} data-net={b.net}>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{b.employe.matricule}</span> · {b.employe.firstName} {b.employe.lastName}
                  </td>
                  <td className="pr-3 text-right tabular-nums">{m(b.brut)}</td>
                  <td className="pr-3 text-right tabular-nums">{m(b.its)}</td>
                  <td className="pr-3 text-right font-medium tabular-nums">{m(b.net)}</td>
                  <td className="pr-3 text-right tabular-nums">{m(b.coutEmployeur)}</td>
                  <td className="pr-3">
                    <Badge variant={b.statut === "VALIDATED" ? "default" : "outline"}>{b.statut === "VALIDATED" ? "Validé" : "Brouillon"}</Badge>
                  </td>
                  <td className="flex items-center gap-2 py-2">
                    <Link href={"/rh/bulletin/" + b.id} className="text-muted-foreground hover:underline">
                      Voir / imprimer
                    </Link>
                    {ecriture && b.statut === "DRAFT" ? (
                      <form action={supprimerBrouillon.bind(null, b.id)}>
                        <Button type="submit" size="sm" variant="ghost">
                          Supprimer
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium" data-testid="bulletins-total" data-brut={tot.brut} data-its={tot.its} data-net={tot.net} data-cout={tot.cout}>
                <td className="pt-3 pr-3">Total</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{m(tot.brut)}</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{m(tot.its)}</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{m(tot.net)}</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{m(tot.cout)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Parametres({ etabId, validation }: { etabId: string; validation: boolean }) {
  const p = await chargerParams(etabId)
  const valeurs = {
    retraiteSalarie: pct(p.retraiteSalarieBp),
    retraitePatronal: pct(p.retraitePatronalBp),
    pf: pct(p.pfBp),
    maternite: pct(p.materniteBp),
    at: pct(p.atBp),
    contribution: pct(p.contributionBp),
    apprentissage: pct(p.apprentissageBp),
    tfpc: pct(p.tfpcBp),
    plafondRetraite: String(p.plafondRetraite),
    plafondAutres: String(p.plafondAutres),
    plancher: String(p.plancher),
    cmuSalarie: String(p.cmuSalarie),
    cmuPatronale: String(p.cmuPatronale),
    ricfDemiPart: String(p.ricfDemiPart),
    cnpsDeductibleIts: p.cnpsDeductibleIts,
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paramètres de paie</CardTitle>
        <CardDescription>Valeurs par défaut CNPS et DGI de Côte d&apos;Ivoire. Taxes patronales, CMU, taux d&apos;accident du travail et déductibilité CNPS sont à faire valider par votre comptable.</CardDescription>
      </CardHeader>
      <CardContent>
        <ParametresFormulaire action={enregistrerParametres} valeurs={valeurs} lecture={!validation} />
      </CardContent>
    </Card>
  )
}