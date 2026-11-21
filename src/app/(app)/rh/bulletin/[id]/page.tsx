import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { db } from "@/lib/db"
import { libellePeriode } from "@/lib/facturation-base"
import { formaterMontant, versIso } from "@/lib/menus"
import { accesPaie } from "@/lib/paie-acces"
import { SITUATIONS } from "@/lib/paie-base"

import { BoutonImprimer } from "./imprimer"

export const metadata: Metadata = { title: "Bulletin de paie" }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BulletinView params={params} />
    </Suspense>
  )
}

async function BulletinView({ params }: { params: Promise<{ id: string }> }) {
  const acces = await accesPaie()
  if (!acces) redirect("/")
  if (!acces.etab) notFound()
  const { id } = await params
  const b = await db.bulletinPaie.findFirst({ where: { id, etablissementId: acces.etab.id }, include: { employe: true } })
  if (!b) notFound()
  const devise = (await db.etablissement.findUnique({ where: { id: acces.etab.id }, select: { currency: true } }))?.currency ?? "XOF"
  const m = (n: number): string => formaterMontant(n, devise)
  const e = b.employe
  const parts = String(b.partsX2 / 2).replace(".", ",")
  const lignes: [string, number, string][] = [
    ["Salaire brut", b.brut, "gain"],
    ["Retraite CNPS (part salarié)", -b.retraiteSalarie, "ret"],
    ["CMU (part salarié)", -b.cmuSalarie, "ret"],
    ["ITS (base " + m(b.baseIts) + ", " + parts + " part(s))", -b.its, "ret"],
  ]
  const patronal: [string, number][] = [
    ["Retraite CNPS (employeur)", b.retraitePatronale],
    ["Prestations familiales", b.pf],
    ["Maternité", b.maternite],
    ["Accident du travail", b.at],
    ["CMU (employeur)", b.cmuPatronale],
    ["Taxes patronales", b.taxesPatronales],
  ]
  return (
    <div className="flex flex-col gap-4">
      <style>{"@media print { body * { visibility: hidden } #bulletin, #bulletin * { visibility: visible } #bulletin { position: absolute; left: 0; top: 0; width: 100% } }"}</style>
      <div className="flex items-center gap-3 print:hidden">
        <Link href={"/rh?vue=bulletins&periode=" + b.periode} className="text-sm text-muted-foreground hover:underline">
          ← Retour aux bulletins
        </Link>
        <div className="ml-auto">
          <BoutonImprimer />
        </div>
      </div>
      <div id="bulletin" className="mx-auto w-full max-w-3xl rounded-lg border bg-background p-8" data-testid="bulletin" data-statut={b.statut} data-net={b.net}>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Bulletin de paie</h2>
            <p className="text-sm text-muted-foreground">
              {libellePeriode(b.periode)} — {acces.etab.name}
            </p>
          </div>
          <p className="text-sm font-medium">{b.statut === "VALIDATED" ? "Validé" : "Brouillon, non définitif"}</p>
        </div>
        <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Employé :</span> {e.firstName} {e.lastName}
          </p>
          <p>
            <span className="text-muted-foreground">Matricule :</span> {e.matricule}
          </p>
          <p>
            <span className="text-muted-foreground">Poste :</span> {e.poste ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Embauche :</span> {versIso(e.dateEmbauche)}
          </p>
          <p>
            <span className="text-muted-foreground">Situation :</span> {SITUATIONS[e.situation]}, {e.enfants} enfant(s)
          </p>
        </div>
        <table className="mt-6 w-full text-sm">
          <tbody>
            {lignes.map(([l, v]) => (
              <tr key={l} className="border-b">
                <td className="py-2">{l}</td>
                <td className="py-2 text-right tabular-nums">{v < 0 ? "− " + m(-v) : m(v)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-3">Net à payer</td>
              <td className="py-3 text-right tabular-nums" data-testid="bulletin-net" data-valeur={b.net}>
                {m(b.net)}
              </td>
            </tr>
          </tbody>
        </table>
        <h3 className="mt-6 text-sm font-semibold">Charges de l&apos;employeur</h3>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {patronal.map(([l, v]) => (
              <tr key={l} className="border-b">
                <td className="py-1.5">{l}</td>
                <td className="py-1.5 text-right tabular-nums">{m(v)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-2">Coût total employeur</td>
              <td className="py-2 text-right tabular-nums" data-testid="bulletin-cout" data-valeur={b.coutEmployeur}>
                {m(b.coutEmployeur)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}