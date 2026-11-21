import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { logout } from "@/lib/auth-actions"
import { db } from "@/lib/db"
import { SERVICES } from "@/lib/menus"
import { dechiffrer } from "@/lib/secret-box"
import { getSession } from "@/lib/session"

const dateLongue = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(d)
const dateCourte = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d)
const libelle = (valeur: string, table: Record<string, string>): string => table[valeur] ?? valeur.replaceAll("_", " ").toLowerCase()
const STATUTS_CONGE: Record<string, string> = { DEMANDE: "En attente", APPROUVE: "Approuvé", REFUSE: "Refusé", ANNULE: "Annulé" }
const STATUTS_POINTAGE: Record<string, string> = { PRESENT: "Présent", ABSENT: "Absent", RETARD: "En retard", CONGE: "Congé" }

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{titre}</dt>
      <dd className="text-right font-medium">{valeur}</dd>
    </div>
  )
}

function Liste({ titre, testid, vide, lignes }: { titre: string; testid: string; vide: string; lignes: { cle: string; texte: string }[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      <h3 className="text-sm font-semibold">{titre}</h3>
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vide}</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {lignes.map((l) => (
            <li key={l.cle} className="border-b py-1.5 last:border-0">
              {l.texte}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Espace personnel en lecture seule des eleves et des employes connectes avec leur code d'acces.
export async function MonEspaceView() {
  const session = await getSession()
  if (!session) redirect("/login")
  if (session.role !== "ELEVE" && session.role !== "EMPLOYE") redirect("/")

  const c = await db.codeAcces.findUnique({
    where: { userId: session.userId },
    include: { etablissement: { select: { name: true, currency: true, prepaye: true } }, inscrit: { include: { groupe: true, regime: true } }, employe: true },
  })
  const deconnexion = (
    <form action={logout}>
      <Button type="submit" variant="outline">
        Se déconnecter
      </Button>
    </form>
  )
  if (!c || !c.actif) {
    return (
      <Card data-testid="mon-espace" data-etat="inactif">
        <CardHeader>
          <CardTitle>Accès indisponible</CardTitle>
          <CardDescription>Votre code d&apos;accès n&apos;est plus actif. Adressez-vous à votre établissement.</CardDescription>
        </CardHeader>
        <CardContent>{deconnexion}</CardContent>
      </Card>
    )
  }
  const code = dechiffrer(c.codeChiffre)
  const monnaie = new Intl.NumberFormat("fr-FR")
  const aujourdhui = new Date()
  aujourdhui.setUTCHours(0, 0, 0, 0)

  const repas = c.inscrit
    ? await db.reservation.findMany({ where: { inscritId: c.inscrit.id, statut: "BOOKED", date: { gte: aujourdhui } }, orderBy: [{ date: "asc" }, { service: "asc" }], take: 8, select: { id: true, date: true, service: true } })
    : []
  const conges = c.employe ? await db.conge.findMany({ where: { employeId: c.employe.id }, orderBy: { debut: "desc" }, take: 5 }) : []
  const pointages = c.employe ? await db.pointage.findMany({ where: { employeId: c.employe.id }, orderBy: { date: "desc" }, take: 7 }) : []

  return (
    <Card data-testid="mon-espace" data-role={session.role}>
      <CardHeader>
        <CardTitle>{session.name}</CardTitle>
        <CardDescription>{c.etablissement.name}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl>
          {c.inscrit ? (
            <>
              <Ligne titre="Matricule" valeur={c.inscrit.matricule} />
              {c.inscrit.groupe ? <Ligne titre="Groupe" valeur={c.inscrit.groupe.name} /> : null}
              {c.inscrit.regime ? <Ligne titre="Régime" valeur={c.inscrit.regime.name} /> : null}
              {c.etablissement.prepaye ? <Ligne titre="Solde du compte" valeur={monnaie.format(c.inscrit.solde) + " " + c.etablissement.currency} /> : null}
            </>
          ) : null}
          {c.employe ? (
            <>
              <Ligne titre="Matricule" valeur={c.employe.matricule} />
              {c.employe.poste ? <Ligne titre="Poste" valeur={c.employe.poste} /> : null}
              <Ligne titre="Date d'embauche" valeur={dateLongue(c.employe.dateEmbauche)} />
            </>
          ) : null}
          {code ? <Ligne titre="Votre code d'accès" valeur={code} /> : null}
        </dl>

        {c.inscrit ? (
          <Liste titre="Prochains repas réservés" testid="mes-repas" vide="Aucun repas réservé à venir." lignes={repas.map((r) => ({ cle: r.id, texte: dateCourte(r.date) + " · " + (SERVICES[r.service] ?? String(r.service)) }))} />
        ) : null}
        {c.employe ? (
          <>
            <Liste
              titre="Mes congés"
              testid="mes-conges"
              vide="Aucun congé enregistré."
              lignes={conges.map((x) => ({ cle: x.id, texte: libelle(String(x.type), {}) + " · du " + dateCourte(x.debut) + " au " + dateCourte(x.fin) + " (" + x.jours + " j) · " + libelle(String(x.statut), STATUTS_CONGE) }))}
            />
            <Liste
              titre="Mes derniers pointages"
              testid="mes-pointages"
              vide="Aucun pointage enregistré."
              lignes={pointages.map((p) => ({ cle: p.id, texte: dateCourte(p.date) + " · " + libelle(String(p.statut), STATUTS_POINTAGE) + (p.minutesRetard > 0 ? " (" + p.minutesRetard + " min de retard)" : "") }))}
            />
          </>
        ) : null}

        <p className="text-xs text-muted-foreground">Gardez votre code pour vous : il vous permet de vous connecter quand vous le souhaitez.</p>
        {deconnexion}
      </CardContent>
    </Card>
  )
}