import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, ajouterJours, aujourdhui, dateValide, libelleJour, versDate } from "@/lib/menus"
import { accesReservations } from "@/lib/reservations-acces"

import { annulerReservation, depointer, pointer, reserverGroupe, reserverInscrit } from "./actions"
import { GroupeForm } from "./groupe-form"
import { ReserverForm } from "./reserver-form"

function comptes(noms: string[]): [string, number][] {
  const m = new Map<string, number>()
  for (const n of noms) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m].sort((a, b) => a[0].localeCompare(b[0], "fr"))
}

export async function ReservationsView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesReservations()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const brut = (Array.isArray(sp.date) ? sp.date[0] : sp.date) ?? ""
  const aujourd = aujourdhui()
  const jour = dateValide(brut) ? brut : aujourd
  const date = versDate(jour)
  const modifiable = ecriture && jour >= aujourd

  const [reservations, menus, groupes] = await Promise.all([
    db.reservation.findMany({
      where: { etablissementId: etab.id, date, statut: "BOOKED" },
      orderBy: { inscrit: { lastName: "asc" } },
      include: { inscrit: { include: { groupe: true, regime: true, allergies: { include: { allergie: true } } } } },
    }),
    db.menu.findMany({ where: { etablissementId: etab.id, date }, include: { plats: { include: { plat: { select: { name: true } } } } } }),
    modifiable ? db.referentiel.findMany({ where: { etablissementId: etab.id, kind: "GROUPE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const lien = (iso: string) => "/reservations?date=" + iso

  return (
    <div className="flex flex-col gap-6" data-testid="jour" data-jour={jour}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Réservations et présences</h2>
        <p className="text-sm capitalize text-muted-foreground">
          {libelleJour(jour)} — <span className="normal-case">{etab.name}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={lien(ajouterJours(jour, -1))} className="hover:underline">
          ← Jour précédent
        </Link>
        <Link href={lien(aujourd)} className="hover:underline">
          Aujourd&apos;hui
        </Link>
        <Link href={lien(ajouterJours(jour, 1))} className="hover:underline">
          Jour suivant →
        </Link>
      </div>

      {ORDRE_SERVICES.map((s) => {
        const menu = menus.find((m) => m.service === s)
        const publie = menu?.statut === "PUBLISHED"
        const rs = reservations.filter((r) => r.service === s)
        const servis = rs.filter((r) => r.servedAt !== null).length
        const allergies = comptes(rs.flatMap((r) => r.inscrit.allergies.map((a) => a.allergie.name)))
        const regimes = comptes(rs.flatMap((r) => (r.inscrit.regime ? [r.inscrit.regime.name] : [])))
        return (
          <Card key={s} data-service={s}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3">
                {SERVICES[s]}
                <Badge variant={publie ? "secondary" : "outline"}>{publie ? "Menu publié" : menu ? "Menu en brouillon" : "Pas de menu"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {publie ? (
                <p className="text-sm text-muted-foreground">{menu.plats.map((p) => p.plat.name).join(", ")}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Menu non publié : réservations fermées.</p>
              )}
              <p className="text-sm" data-testid={"compteurs-" + s} data-reserves={rs.length} data-servis={servis}>
                Réservés : <span className="font-medium">{rs.length}</span> · Servis : <span className="font-medium">{servis}</span>
              </p>
              {allergies.length > 0 || regimes.length > 0 ? (
                <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {allergies.map(([nom, n]) => (
                    <li key={"a" + nom} data-stat={"allergie:" + nom}>
                      Allergie {nom} : {n}
                    </li>
                  ))}
                  {regimes.map(([nom, n]) => (
                    <li key={"r" + nom} data-stat={"regime:" + nom}>
                      Régime {nom} : {n}
                    </li>
                  ))}
                </ul>
              ) : null}
              {modifiable && publie ? (
                <div className="flex flex-col gap-4">
                  <ReserverForm action={reserverInscrit.bind(null, jour, s)} service={s} />
                  <GroupeForm action={reserverGroupe.bind(null, jour, s)} service={s} groupes={groupes} />
                </div>
              ) : null}
              {rs.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Matricule</th>
                      <th className="py-2 pr-4 font-medium">Nom</th>
                      <th className="py-2 pr-4 font-medium">Groupe</th>
                      <th className="py-2 pr-4 font-medium">Allergies</th>
                      <th className="py-2 pr-4 font-medium">État</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rs.map((r) => {
                      const servi = r.servedAt !== null
                      return (
                        <tr key={r.id} data-matricule={r.inscrit.matricule} className="border-b align-top last:border-0">
                          <td className="py-2 pr-4">{r.inscrit.matricule}</td>
                          <td className="py-2 pr-4">
                            {r.inscrit.lastName} {r.inscrit.firstName}
                          </td>
                          <td className="py-2 pr-4">{r.inscrit.groupe?.name ?? "—"}</td>
                          <td className="py-2 pr-4">{r.inscrit.allergies.map((a) => a.allergie.name).join(", ") || "—"}</td>
                          <td className="py-2 pr-4" data-etat={servi ? "servi" : "reserve"}>
                            {servi ? "Servi" : "Réservé"}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              {ecriture && jour === aujourd && !servi ? <BoutonAction action={pointer.bind(null, r.id)} label="Pointer" /> : null}
                              {ecriture && jour === aujourd && servi ? <BoutonAction action={depointer.bind(null, r.id)} label="Annuler le pointage" /> : null}
                              {modifiable && !servi ? <BoutonAction action={annulerReservation.bind(null, r.id)} label="Annuler la réservation" variant="ghost" /> : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}