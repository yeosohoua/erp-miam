import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFacturation } from "@/lib/facturation-acces"
import { RELANCE_MAX, STATUTS_FACTURE, libellePeriode, numeroAffiche, restant } from "@/lib/facturation-base"
import { aujourdhui, formaterMontant, versIso } from "@/lib/menus"
import { METHODES } from "@/lib/paiements-base"

import { annulerFacture, emettre, encaisser, relancer, supprimerBrouillon } from "../actions"
import { BoutonImprimer, EmissionForm, EncaissementForm, RelanceForm } from "../formulaires"

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" })
const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" })

export async function FactureView({ params }: { params: Promise<{ id: string }> }) {
  const acces = await accesFacturation()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  const { id } = await params
  const f = etab
    ? await db.facture.findFirst({
        where: { id, etablissementId: etab.id },
        include: {
          client: true,
          etablissement: { select: { name: true, currency: true } },
          lignes: { orderBy: { libelle: "asc" } },
          reglements: { orderBy: { createdAt: "asc" } },
          relances: { orderBy: { niveau: "asc" } },
        },
      })
    : null
  if (!f) redirect("/facturation")
  const m = (n: number) => formaterMontant(n, f.etablissement.currency)
  const paye = f.reglements.reduce((s, r) => s + r.montant, 0)
  const reste = f.statut === "ISSUED" ? restant(f.total, f.reglements) : 0
  const retard = f.statut === "ISSUED" && reste > 0 && !!f.echeance && versIso(f.echeance) < aujourdhui()

  return (
    <div className="flex flex-col gap-6" data-testid="facture-detail" data-statut={f.statut} data-total={f.total} data-restant={reste} data-numero={f.numero ?? ""}>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Link href="/facturation" className="text-sm text-muted-foreground hover:underline print:hidden">
            ← Facturation
          </Link>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Facture {numeroAffiche(f.numero)}</h2>
          <p className="text-sm text-muted-foreground">
            {f.etablissement.name} · <span className="capitalize">{libellePeriode(f.periode)}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={f.statut === "PAID" ? "secondary" : "outline"}>{STATUTS_FACTURE[f.statut]}</Badge>
          {retard ? <span className="text-sm font-medium text-red-600">En retard</span> : null}
          <BoutonImprimer />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Client</CardDescription>
          <CardTitle>{f.client.name}</CardTitle>
          <CardDescription>{[f.client.email, f.client.phone, f.client.address].filter(Boolean).join(" · ")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {f.emisLe ? "Émise le " + HEURE.format(f.emisLe) : "Brouillon non émis"}
          {f.echeance ? " · Échéance le " + DATE.format(f.echeance) : ""}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détail</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="lignes">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Désignation</th>
                <th className="py-2 pr-4 text-right font-medium">Quantité</th>
                <th className="py-2 pr-4 text-right font-medium">Prix unitaire</th>
                <th className="py-2 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {f.lignes.map((l) => (
                <tr key={l.id} data-libelle={l.libelle} data-quantite={l.quantite} data-montant={l.montant} className="border-b last:border-0">
                  <td className="py-2 pr-4">{l.libelle}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantite}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{m(l.prixUnitaire)}</td>
                  <td className="py-2 text-right tabular-nums">{m(l.montant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right font-medium">
                  Total
                </td>
                <td className="pt-3 text-right text-base font-semibold tabular-nums">{m(f.total)}</td>
              </tr>
              {f.statut === "ISSUED" || f.statut === "PAID" ? (
                <tr>
                  <td colSpan={3} className="pt-1 text-right text-muted-foreground">
                    Déjà réglé
                  </td>
                  <td className="pt-1 text-right tabular-nums">{m(paye)}</td>
                </tr>
              ) : null}
              {f.statut === "ISSUED" ? (
                <tr>
                  <td colSpan={3} className="pt-1 text-right font-medium">
                    Reste dû
                  </td>
                  <td className="pt-1 text-right font-semibold tabular-nums">{m(reste)}</td>
                </tr>
              ) : null}
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {f.reglements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Règlements</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="reglements">
              <tbody>
                {f.reglements.map((r) => (
                  <tr key={r.id} data-montant={r.montant} data-reference={r.reference ?? ""} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{HEURE.format(r.createdAt)}</td>
                    <td className="py-2 pr-4">
                      {METHODES[r.methode]}
                      {r.reference ? " · " + r.reference : ""}
                    </td>
                    <td className="py-2 text-right tabular-nums text-emerald-600">+{m(r.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {f.relances.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Relances</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm" data-testid="relances">
              {f.relances.map((r) => (
                <li key={r.id} data-niveau={r.niveau}>
                  Relance n°{r.niveau} · {HEURE.format(r.createdAt)}
                  {r.note ? " · " + r.note : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {ecriture && f.statut === "DRAFT" ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Émission</CardTitle>
            <CardDescription>Une fois émise, la facture reçoit son numéro et ne peut plus être modifiée.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EmissionForm action={emettre.bind(null, f.id)} />
            <BoutonAction action={supprimerBrouillon.bind(null, f.id)} label="Supprimer le brouillon" variant="ghost" />
          </CardContent>
        </Card>
      ) : null}

      {ecriture && f.statut === "ISSUED" ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Encaisser</CardTitle>
            <CardDescription>Règlement total ou partiel. Chaque référence Mobile Money ne peut servir qu&apos;une fois.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EncaissementForm action={encaisser.bind(null, f.id)} />
            {f.reglements.length === 0 ? <BoutonAction action={annulerFacture.bind(null, f.id)} label="Annuler la facture" variant="ghost" /> : null}
          </CardContent>
        </Card>
      ) : null}

      {ecriture && retard ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Relance</CardTitle>
            <CardDescription>
              Trace chaque relance (jusqu&apos;à {RELANCE_MAX}). Le client est prévenu par les canaux activés dans Paramètres, Notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {f.relances.length < RELANCE_MAX ? (
              <RelanceForm action={relancer.bind(null, f.id)} />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="relances-max">
                {RELANCE_MAX} relances enregistrées : étape suivante, le recouvrement.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}