import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFamille, enfantDe } from "@/lib/famille"
import { ORDRE_SERVICES, SERVICES, ajouterJours, aujourdhui, formaterMontant, libelleJour, versDate, versIso } from "@/lib/menus"
import { METHODES, TYPES_OPERATION } from "@/lib/paiements-base"
import { RECHARGE_MAX, RECHARGE_MIN, paystackConfigure } from "@/lib/paystack"
import { auteurParent } from "@/lib/satisfaction-base"

import { annulerEnfant, donnerAvis, lancerRecharge, reserverEnfant, verifierRecharge } from "../actions"
import { RechargeEnLigne } from "../recharge-en-ligne"
import { AvisRepas } from "../avis-repas"
import { PhotoForm } from "@/components/photo-form"
import { retirerPhotoEnfant, televerserPhotoEnfant } from "../photo-actions"

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" })

export async function EnfantView({ params }: { params: Promise<{ id: string }> }) {
  const session = await accesFamille()
  if (!session) redirect("/")
  const { id } = await params
  const enfant = await enfantDe(session.email, id)
  if (!enfant) redirect("/famille")
  const etab = enfant.etablissement
  const m = (n: number) => formaterMontant(n, etab.currency)
  const jour = aujourdhui()
  const fin = ajouterJours(jour, 6)
  const allergiesEnfant = new Set(enfant.allergies.map((a) => a.allergieId))
  const prix: Record<string, number> = Object.fromEntries(etab.tarifs.map((t) => [t.service, t.prix]))

  const [menus, reservations, operations, attente] = await Promise.all([
    db.menu.findMany({
      where: { etablissementId: etab.id, statut: "PUBLISHED", date: { gte: versDate(jour), lte: versDate(fin) } },
      include: { plats: { include: { plat: { select: { name: true, ingredients: { select: { ingredient: { select: { allergens: { select: { allergieId: true, allergie: { select: { name: true } } } } } } } } } } } } },
    }),
    db.reservation.findMany({ where: { inscritId: enfant.id, date: { gte: versDate(jour), lte: versDate(fin) } }, select: { date: true, service: true, statut: true, servedAt: true } }),
    db.transaction.findMany({ where: { inscritId: enfant.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.paiementEnLigne.findMany({ where: { inscritId: enfant.id, userId: session.userId, statut: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ])
  const resMap = new Map(reservations.map((r) => [versIso(r.date) + "_" + r.service, r]))
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(jour, i))
  const enligne = await paystackConfigure()
  const debutAvis = versDate(ajouterJours(jour, -14))
  const auteurAvis = auteurParent(enfant.firstName, enfant.lastName)
  const servis = await db.reservation.findMany({ where: { inscritId: enfant.id, statut: "BOOKED", servedAt: { not: null }, date: { gte: debutAvis, lte: versDate(jour) } }, select: { date: true, service: true }, orderBy: [{ date: "desc" }, { service: "asc" }] })
  const dejaNotes = servis.length > 0 ? await db.avis.findMany({ where: { etablissementId: etab.id, source: "PARENT", auteur: auteurAvis, date: { gte: debutAvis, lte: versDate(jour) } }, select: { date: true, service: true } }) : []
  const menusServis = servis.length > 0 ? await db.menu.findMany({ where: { etablissementId: etab.id, date: { gte: debutAvis, lte: versDate(jour) } }, include: { plats: { include: { plat: { select: { id: true, name: true } } } } } }) : []

  return (
    <div className="flex flex-col gap-6" data-testid="fiche-enfant">
      <div>
        <Link href="/famille" className="text-sm text-muted-foreground hover:underline">
          ← Mes enfants
        </Link>
        <div className="mt-3"><PhotoForm imageId={enfant.imageId} nom={enfant.firstName + " " + enfant.lastName} televerser={televerserPhotoEnfant.bind(null, enfant.id)} retirer={retirerPhotoEnfant.bind(null, enfant.id)} /></div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {enfant.firstName} {enfant.lastName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {enfant.matricule} · {etab.name}
          {enfant.groupe ? " · " + enfant.groupe.name : ""}
        </p>
        {enfant.allergies.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {enfant.allergies.map((a) => (
              <Badge key={a.allergieId} variant="outline">
                Allergie : {a.allergie.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {etab.prepaye ? (
        <Card data-testid="solde-enfant" data-solde={enfant.solde}>
          <CardHeader>
            <CardDescription>Solde du compte repas</CardDescription>
            <CardTitle className={"text-3xl tabular-nums " + (enfant.solde <= 0 ? "text-red-600" : "")}>{m(enfant.solde)}</CardTitle>
            {enfant.solde <= 0 ? <CardDescription>Solde épuisé : rechargez pour que les repas puissent être servis.</CardDescription> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {enligne ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Paiement sécurisé par Paystack (Mobile Money ou carte). Montant de {m(RECHARGE_MIN)} à {m(RECHARGE_MAX)}.
                </p>
                <RechargeEnLigne action={lancerRecharge.bind(null, enfant.id)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Le paiement en ligne n&apos;est pas encore activé. Rechargez auprès du caissier de l&apos;établissement.</p>
            )}
            {attente.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Paiements en attente de confirmation</p>
                <ul className="flex flex-col gap-2" data-testid="paiements-attente">
                  {attente.map((p) => (
                    <li key={p.id} data-reference={p.reference} className="flex flex-wrap items-center gap-3 text-sm">
                      <span>
                        {m(p.montant)} · {HEURE.format(p.createdAt)}
                      </span>
                      <BoutonAction action={verifierRecharge.bind(null, p.reference)} label="Vérifier" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Le compte prépayé n&apos;est pas activé dans cet établissement.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Repas des 7 prochains jours</CardTitle>
          <CardDescription>Seuls les menus publiés par la cantine sont réservables. Les allergènes de votre enfant sont signalés.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {menus.length === 0 ? <p className="text-sm text-muted-foreground">Aucun menu publié pour le moment.</p> : null}
          {jours.map((j) => {
            const lignes = ORDRE_SERVICES.flatMap((s) => {
              const menu = menus.find((mn) => versIso(mn.date) === j && mn.service === s)
              if (!menu) return []
              const plats = menu.plats.map((mp) => {
                const alertes = new Set<string>()
                for (const l of mp.plat.ingredients) for (const a of l.ingredient.allergens) if (allergiesEnfant.has(a.allergieId)) alertes.add(a.allergie.name)
                return { nom: mp.plat.name, alertes: [...alertes] }
              })
              const r = resMap.get(j + "_" + s)
              const etat = r?.statut === "BOOKED" ? (r.servedAt ? "servi" : "reserve") : "libre"
              return [{ s, plats, etat }]
            })
            if (lignes.length === 0) return null
            return (
              <div key={j} className="flex flex-col gap-2">
                <p className="text-sm font-medium capitalize">{libelleJour(j)}</p>
                <ul className="flex flex-col gap-2">
                  {lignes.map(({ s, plats, etat }) => {
                    const alertes = [...new Set(plats.flatMap((p) => p.alertes))]
                    return (
                      <li key={s} data-testid="repas" data-date={j} data-service={s} data-etat={etat} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">
                            {SERVICES[s]}
                            {etab.prepaye && (prix[s] ?? 0) > 0 ? " · " + m(prix[s]) : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">{plats.map((p) => p.nom).join(", ") || "Menu publié"}</p>
                          {alertes.length > 0 ? (
                            <p className="text-sm font-medium text-red-600" data-testid="alerte-allergene">
                              ⚠ Contient : {alertes.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                          {etat === "servi" ? <Badge>Servi</Badge> : null}
                          {etat === "reserve" ? (
                            <>
                              <Badge variant="secondary">Réservé</Badge>
                              <BoutonAction action={annulerEnfant.bind(null, enfant.id, j, s)} label="Annuler" variant="ghost" />
                            </>
                          ) : null}
                          {etat === "libre" && enfant.statut === "ACTIVE" ? <BoutonAction action={reserverEnfant.bind(null, enfant.id, j, s)} label="Réserver" /> : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {servis.length > 0 ? (
        <Card data-testid="avis-repas">
          <CardHeader>
            <CardTitle>Votre avis sur les repas</CardTitle>
            <CardDescription>Notez les repas servis à votre enfant ces 14 derniers jours : la cantine s&apos;en sert pour améliorer les menus.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {servis.map((r) => {
              const j = versIso(r.date)
              const note = dejaNotes.some((a) => versIso(a.date) === j && a.service === r.service)
              const menu = menusServis.find((mn) => versIso(mn.date) === j && mn.service === r.service)
              const platsMenu = menu ? menu.plats.map((mp) => ({ id: mp.plat.id, name: mp.plat.name })) : []
              return (
                <div key={j + "_" + r.service} data-testid="repas-a-noter" data-date={j} data-service={r.service} data-note={note ? "oui" : "non"} className="rounded-lg border p-3">
                  <p className="text-sm font-medium capitalize">
                    {libelleJour(j)} · {SERVICES[r.service]}
                  </p>
                  {note ? <p className="text-sm text-muted-foreground">Merci, votre avis a été transmis à la cantine.</p> : <AvisRepas action={donnerAvis.bind(null, enfant.id, j, r.service)} plats={platsMenu} />}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
      {etab.prepaye ? (
        <Card>
          <CardHeader>
            <CardTitle>Historique du compte</CardTitle>
            <CardDescription>20 dernières opérations.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="historique">
              <tbody>
                {operations.map((o) => (
                  <tr key={o.id} data-type={o.type} data-montant={o.montant} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{HEURE.format(o.createdAt)}</td>
                    <td className="py-2 pr-4">
                      {TYPES_OPERATION[o.type]}
                      {o.methode ? " · " + METHODES[o.methode] : ""}
                    </td>
                    <td className={"py-2 text-right tabular-nums " + (o.montant < 0 ? "text-red-600" : "text-emerald-600")}>{(o.montant > 0 ? "+" : "") + m(o.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {operations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune opération pour le moment.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}