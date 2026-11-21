import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFacturation } from "@/lib/facturation-acces"

import { creerClient, rattacher, supprimerClient } from "../actions"
import { ClientForm, RattacherForm } from "../formulaires"

export async function ClientsView() {
  const acces = await accesFacturation()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>
  const clients = await db.client.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, include: { _count: { select: { inscrits: true, factures: true } } } })

  return (
    <div className="flex flex-col gap-6" data-testid="clients-page">
      <div>
        <Link href="/facturation" className="text-sm text-muted-foreground hover:underline">
          ← Facturation
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Clients payeurs</h2>
        <p className="text-sm text-muted-foreground">Entreprise ou famille qui règle les repas de ses inscrits — {etab.name}</p>
      </div>

      {ecriture ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Nouveau client</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientForm action={creerClient} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rattacher un inscrit</CardTitle>
              <CardDescription>Les repas servis à cet inscrit seront facturés à ce client. Choisissez « Aucun » pour détacher.</CardDescription>
            </CardHeader>
            <CardContent>
              <RattacherForm action={rattacher} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="clients">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 pr-4 text-right font-medium">Inscrits</th>
                <th className="py-2 pr-4 text-right font-medium">Factures</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} data-client={c.name} data-inscrits={c._count.inscrits} data-factures={c._count.factures} className="border-b align-top last:border-0">
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c._count.inscrits}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c._count.factures}</td>
                  <td className="py-2 text-right">{ecriture ? <BoutonAction action={supprimerClient.bind(null, c.id)} label="Supprimer" variant="ghost" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 ? <p className="text-sm text-muted-foreground">Aucun client pour le moment.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}