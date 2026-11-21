import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { formaterMontant } from "@/lib/menus"
import { accesPaiements } from "@/lib/paiements-acces"
import { METHODES, TYPES_OPERATION } from "@/lib/paiements-base"

import { ajuster, recharger } from "../actions"
import { AjustementForm } from "../ajustement-form"
import { RechargeForm } from "../recharge-form"

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" })

export async function FicheView({ params }: { params: Promise<{ id: string }> }) {
  const acces = await accesPaiements()
  if (!acces) redirect("/")
  const { etab, ecriture, config } = acces
  if (!etab) redirect("/paiements")
  const { id } = await params
  const inscrit = await db.inscrit.findFirst({ where: { id, etablissementId: etab.id }, include: { groupe: true } })
  if (!inscrit) redirect("/paiements")
  const [operations, info] = await Promise.all([
    db.transaction.findMany({ where: { inscritId: inscrit.id, etablissementId: etab.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }),
  ])
  const m = (n: number) => formaterMontant(n, info?.currency ?? "XOF")

  return (
    <div className="flex flex-col gap-6" data-testid="fiche-paiement">
      <div>
        <Link href="/paiements" className="text-sm text-muted-foreground hover:underline">
          ← Tous les comptes
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {inscrit.lastName} {inscrit.firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {inscrit.matricule}
          {inscrit.groupe ? " · " + inscrit.groupe.name : ""}
        </p>
      </div>

      <Card data-testid="solde-inscrit" data-solde={inscrit.solde}>
        <CardHeader>
          <CardDescription>Solde du compte</CardDescription>
          <CardTitle className={"text-3xl tabular-nums " + (inscrit.solde <= 0 ? "text-red-600" : "")}>{m(inscrit.solde)}</CardTitle>
        </CardHeader>
      </Card>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Recharger</CardTitle>
          </CardHeader>
          <CardContent>
            <RechargeForm action={recharger} matricule={inscrit.matricule} />
          </CardContent>
        </Card>
      ) : null}

      {config ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajustement manuel</CardTitle>
            <CardDescription>Correction tracée dans l&apos;historique et le journal d&apos;audit.</CardDescription>
          </CardHeader>
          <CardContent>
            <AjustementForm action={ajuster.bind(null, inscrit.id)} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
          <CardDescription>100 dernières opérations.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="historique">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Opération</th>
                <th className="py-2 pr-4 font-medium">Détail</th>
                <th className="py-2 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((o) => (
                <tr key={o.id} data-type={o.type} data-montant={o.montant} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{HEURE.format(o.createdAt)}</td>
                  <td className="py-2 pr-4">
                    {TYPES_OPERATION[o.type]}
                    {o.methode ? " · " + METHODES[o.methode] : ""}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{[o.reference, o.note].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={"py-2 text-right tabular-nums " + (o.montant < 0 ? "text-red-600" : "text-emerald-600")}>{(o.montant > 0 ? "+" : "") + m(o.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {operations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune opération.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}