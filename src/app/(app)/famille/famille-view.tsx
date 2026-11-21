import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFamille, enfantsDe } from "@/lib/famille"
import { aujourdhui, formaterMontant, versDate } from "@/lib/menus"

export async function FamilleView() {
  const session = await accesFamille()
  if (!session) redirect("/")
  const enfants = await enfantsDe(session.email)
  const reservations = enfants.length
    ? await db.reservation.groupBy({
        by: ["inscritId"],
        where: { inscritId: { in: enfants.map((e) => e.id) }, statut: "BOOKED", servedAt: null, date: { gte: versDate(aujourdhui()) } },
        _count: { _all: true },
      })
    : []
  const aVenir = new Map(reservations.map((r) => [r.inscritId, r._count._all]))

  return (
    <div className="flex flex-col gap-6" data-testid="liste-enfants">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Mes enfants</h2>
        <p className="text-sm text-muted-foreground">Solde, recharge en ligne, repas et réservations.</p>
      </div>
      {enfants.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="aucun-enfant">
          Aucun enfant n&apos;est rattaché à votre adresse e-mail. Demandez à l&apos;établissement d&apos;ajouter votre adresse sur la fiche de votre enfant.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {enfants.map((e) => (
            <Link key={e.id} href={"/famille/" + e.id} data-testid="enfant-card" data-matricule={e.matricule}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>
                    {e.firstName} {e.lastName}
                  </CardTitle>
                  <CardDescription>
                    {e.matricule} · {e.etablissement.name}
                    {e.groupe ? " · " + e.groupe.name : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {e.etablissement.prepaye ? (
                    <p className={e.solde <= 0 ? "font-medium text-red-600" : "font-medium"}>Solde : {formaterMontant(e.solde, e.etablissement.currency)}</p>
                  ) : (
                    <p className="text-muted-foreground">Compte prépayé non activé</p>
                  )}
                  <p className="text-muted-foreground">{aVenir.get(e.id) ?? 0} repas réservé(s) à venir</p>
                  {e.allergies.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.allergies.map((a) => (
                        <Badge key={a.allergieId} variant="outline">
                          {a.allergie.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {e.statut !== "ACTIVE" ? <Badge variant="outline">Compte non actif</Badge> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}