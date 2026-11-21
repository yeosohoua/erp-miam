import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, aujourdhui, libelleJour, serviceValide, versDate } from "@/lib/menus"
import { INSCRITS_ECRITURE, hasRole } from "@/lib/permissions"
import { accesReservations } from "@/lib/reservations-acces"
import { formaterHeure, serviceParDefaut } from "@/lib/service"

import { scanner } from "./actions"
import { preparerHorsLigne, synchroniserPassages } from "./hors-ligne-actions"
import { ScanClient } from "./scan-client"

export async function ServiceView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesReservations()
  if (!acces) redirect("/")
  const { etab, ecriture, session } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const brut = (Array.isArray(sp.service) ? sp.service[0] : sp.service) ?? ""
  const service = serviceValide(brut) ? brut : serviceParDefaut()
  const jour = aujourdhui()
  const date = versDate(jour)
  const base = { etablissementId: etab.id, date, service, statut: "BOOKED" as const }

  const [menu, reserves, servis, horsReservation, recents] = await Promise.all([
    db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etab.id, date, service } }, select: { statut: true } }),
    db.reservation.count({ where: base }),
    db.reservation.count({ where: { ...base, servedAt: { not: null } } }),
    db.reservation.count({ where: { ...base, servedAt: { not: null }, walkIn: true } }),
    db.reservation.findMany({
      where: { ...base, servedAt: { not: null } },
      orderBy: { servedAt: "desc" },
      take: 8,
      include: { inscrit: { select: { firstName: true, lastName: true, matricule: true } } },
    }),
  ])
  const ouvert = menu?.statut === "PUBLISHED"
  const reste = Math.max(reserves - servis, 0)
  const avancement = reserves > 0 ? Math.min(100, Math.round((servis * 100) / reserves)) : 0

  return (
    <div className="flex flex-col gap-6" data-testid="service-page" data-service={service}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Service — {SERVICES[service]}</h2>
          <p className="text-sm capitalize text-muted-foreground">
            {libelleJour(jour)} — <span className="normal-case">{etab.name}</span>
          </p>
        </div>
        {hasRole(session.role, INSCRITS_ECRITURE) ? (
          <Link href="/inscrits/badges" className="text-sm hover:underline">
            Imprimer les badges →
          </Link>
        ) : null}
      </div>

      <nav aria-label="Services" className="flex flex-wrap gap-2">
        {ORDRE_SERVICES.map((s) => (
          <Link
            key={s}
            href={"/service?service=" + s}
            data-service-tab={s}
            aria-current={s === service ? "true" : undefined}
            className={"rounded-lg border px-4 py-2 text-sm font-medium " + (s === service ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {SERVICES[s]}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            Avancement
            <Badge variant={ouvert ? "secondary" : "outline"}>{ouvert ? "Menu publié" : "Service fermé : menu non publié"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: avancement + "%" }} />
          </div>
          <p className="text-sm" data-testid="compteurs-service" data-reserves={reserves} data-servis={servis} data-hors={horsReservation}>
            Réservés : <span className="font-medium">{reserves}</span> · Servis : <span className="font-medium">{servis}</span> · Restants : <span className="font-medium">{reste}</span> · Hors réservation :{" "}
            <span className="font-medium">{horsReservation}</span>
          </p>
        </CardContent>
      </Card>

      {ecriture ? (
        <ScanClient action={scanner.bind(null, service)} service={service} etabId={etab.id} userId={session.userId} preparer={preparerHorsLigne} synchroniser={synchroniserPassages} />
      ) : (
        <p className="text-sm text-muted-foreground">Consultation seulement : votre rôle ne permet pas de pointer les repas.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Derniers passages</CardTitle>
        </CardHeader>
        <CardContent>
          {recents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun repas servi pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm" data-testid="derniers-passages">
              {recents.map((r) => (
                <li key={r.id} data-matricule={r.inscrit.matricule} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <span>
                    {r.inscrit.lastName} {r.inscrit.firstName} <span className="text-muted-foreground">({r.inscrit.matricule})</span>
                    {r.walkIn ? <Badge variant="outline" className="ml-2">Hors réservation</Badge> : null}
                  </span>
                  <span className="text-muted-foreground">{r.servedAt ? formaterHeure(r.servedAt) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}