import type { Metadata } from "next"
import { Suspense } from "react"

import { BoutonImprimer } from "@/components/bouton-imprimer"
import { accesCaisse } from "@/lib/caisse-acces"
import { MODES, ORDRE_MODES, especesAttendues, ventiler } from "@/lib/caisse-base"
import { db } from "@/lib/db"
import { formaterNombre } from "@/lib/menus"

export const metadata: Metadata = { title: "Rapport de caisse" }

const f = (n: number): string => formaterNombre(n) + " FCFA"
const quand = (d: Date | null): string => (d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(d) : "—")

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Rapport params={params} />
    </Suspense>
  )
}

async function Rapport({ params }: { params: Promise<{ id: string }> }) {
  const a = await accesCaisse()
  if (!a || !a.etab) return <p className="p-6 text-sm">Accès refusé.</p>
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/.test(id)) return <p className="p-6 text-sm">Caisse introuvable.</p>
  const s = await db.sessionCaisse.findFirst({ where: { id, etablissementId: a.etab.id }, include: { ventes: { select: { methode: true, statut: true, total: true, partCompte: true } } } })
  if (!s || (!a.config && s.caissierEmail !== a.session.email)) return <p className="p-6 text-sm">Caisse introuvable.</p>
  const v = ventiler(s.ventes)
  const attendu = s.especesAttendues ?? especesAttendues(s.fondInitial, v.parMode.CASH?.total ?? 0)
  const ouverte = s.statut === "OUVERTE"
  return (
    <main data-testid="z-rapport" data-numero={s.numero} data-statut={s.statut} className="mx-auto max-w-xl space-y-4 bg-white p-6 text-sm text-neutral-900 print:p-0">
      <div>
        <h1 className="text-xl font-semibold">Rapport de caisse n° {s.numero}</h1>
        <p>{a.etab.name}</p>
        <p>Caissier : {s.caissierEmail}</p>
        <p>Ouverte le {quand(s.ouverteLe)} — {ouverte ? "encore ouverte" : "clôturée le " + quand(s.clotureeLe) + (s.clotureePar ? " par " + s.clotureePar : "")}</p>
      </div>
      <table className="w-full border-y">
        <thead>
          <tr className="text-left"><th className="py-1">Mode de paiement</th><th>Ventes</th><th className="text-right">Montant</th></tr>
        </thead>
        <tbody>
          {ORDRE_MODES.filter((m) => v.parMode[m]).map((m) => (
            <tr key={m} data-mode-z={m}><td className="py-1">{MODES[m]}</td><td>{v.parMode[m].nb}</td><td className="text-right">{f(v.parMode[m].total)}</td></tr>
          ))}
          <tr className="border-t font-semibold"><td className="py-1">Total encaissé</td><td>{v.nbPayees}</td><td className="text-right" data-testid="z-total" data-valeur={v.totalPayees}>{f(v.totalPayees)}</td></tr>
          <tr><td className="py-1">Ventes annulées</td><td>{v.nbAnnulees}</td><td className="text-right">{f(v.totalAnnulees)}</td></tr>
        </tbody>
      </table>
      <table className="w-full">
        <tbody>
          <tr><td className="py-1">Fond de caisse</td><td className="text-right">{f(s.fondInitial)}</td></tr>
          <tr><td className="py-1">Espèces attendues (fond + ventes en espèces)</td><td className="text-right" data-testid="z-attendu" data-valeur={attendu}>{f(attendu)}</td></tr>
          <tr><td className="py-1">Espèces comptées</td><td className="text-right" data-testid="z-compte" data-valeur={s.especesComptees ?? ""}>{s.especesComptees !== null ? f(s.especesComptees) : "—"}</td></tr>
          <tr className="font-semibold"><td className="py-1">Écart</td><td className="text-right" data-testid="z-ecart" data-valeur={s.ecart ?? ""}>{s.ecart !== null ? (s.ecart > 0 ? "+" : "") + s.ecart + " FCFA" : "—"}</td></tr>
        </tbody>
      </table>
      {s.noteCloture ? <p>Note : {s.noteCloture}</p> : null}
      <div className="flex gap-3 pt-4 print:hidden"><BoutonImprimer libelle="Imprimer le rapport" /></div>
    </main>
  )
}