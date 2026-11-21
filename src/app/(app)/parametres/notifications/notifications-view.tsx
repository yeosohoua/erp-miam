import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { reglagesDe } from "@/lib/notifications"
import { accesNotifications } from "@/lib/notifications-acces"
import { CANAUX, EVENEMENTS, ORDRE_CANAUX, STATUTS_NOTIFICATION, type StatutNotification } from "@/lib/notifications-base"
import { VARIABLES_CANAL, canalConfigure } from "@/lib/notifications-envoi"

import { enregistrerReglages, envoyerTest, reessayerEchecs } from "./actions"
import { ReglagesForm, TestForm } from "./formulaires"

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" })

export async function NotificationsView() {
  const acces = await accesNotifications()
  if (!acces) redirect("/")
  const { etab } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const [reglages, journal, aReprendre] = await Promise.all([
    reglagesDe(etab.id),
    db.notification.findMany({ where: { etablissementId: etab.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { etablissementId: etab.id, statut: { in: ["FAILED", "SKIPPED", "PENDING"] } } }),
  ])

  const configures = await Promise.all(ORDRE_CANAUX.map((c) => canalConfigure(c)))

  return (
    <div className="flex flex-col gap-6" data-testid="notifications-page">
      <div>
        <Link href="/parametres" className="text-sm text-muted-foreground hover:underline">
          ← Paramètres
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Notifications</h2>
        <p className="text-sm text-muted-foreground">SMS, WhatsApp et e-mail — {etab.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canaux du serveur</CardTitle>
          <CardDescription>Les clés d&apos;accès se règlent dans Paramètres › Configuration (administrateur) ; elles ne sont jamais affichées.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="canaux">
            <tbody>
              {ORDRE_CANAUX.map((c, i) => {
                const ok = configures[i]
                return (
                  <tr key={c} data-canal={c} data-configure={ok ? "1" : "0"} className="border-b align-top last:border-0">
                    <td className="py-2 pr-4 font-medium">{CANAUX[c]}</td>
                    <td className={"py-2 pr-4 " + (ok ? "text-emerald-600" : "text-destructive")}>{ok ? "Configuré" : "Non configuré"}</td>
                    <td className="py-2 text-muted-foreground">{ok ? "" : "À renseigner : " + VARIABLES_CANAL[c]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Réglages de l&apos;établissement</CardTitle>
        </CardHeader>
        <CardContent>
          <ReglagesForm action={enregistrerReglages} reglages={reglages} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message de test</CardTitle>
          <CardDescription>Vérifie qu&apos;un canal fonctionne avant de l&apos;activer.</CardDescription>
        </CardHeader>
        <CardContent>
          <TestForm action={envoyerTest} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal d&apos;envoi</CardTitle>
          <CardDescription>50 derniers messages. Les envois en échec sont repris automatiquement par l&apos;appel planifié, ou à la main ci-dessous.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {aReprendre > 0 ? (
            <div data-testid="reprise">
              <BoutonAction action={reessayerEchecs} label="Réessayer les échecs" />
            </div>
          ) : null}
          <table className="w-full text-sm" data-testid="journal">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Événement</th>
                <th className="py-2 pr-4 font-medium">Canal</th>
                <th className="py-2 pr-4 font-medium">Destinataire</th>
                <th className="py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((n) => (
                <tr key={n.id} data-evenement={n.evenement} data-canal={n.canal} data-statut={n.statut} data-destinataire={n.destinataire} className="border-b align-top last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{HEURE.format(n.createdAt)}</td>
                  <td className="py-2 pr-4">{EVENEMENTS[n.evenement as keyof typeof EVENEMENTS] ?? n.evenement}</td>
                  <td className="py-2 pr-4">{CANAUX[n.canal]}</td>
                  <td className="py-2 pr-4">{n.destinataire}</td>
                  <td className={"py-2 " + (n.statut === "SENT" ? "text-emerald-600" : n.statut === "FAILED" ? "text-destructive" : "text-muted-foreground")}>
                    {STATUTS_NOTIFICATION[n.statut as StatutNotification]}
                    {n.erreur ? " — " + n.erreur : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {journal.length === 0 ? <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}