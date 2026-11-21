import type { Metadata } from "next"
import { Suspense } from "react"

import { BoutonImprimer } from "@/components/bouton-imprimer"
import { accesCaisse } from "@/lib/caisse-acces"
import { MODES, numeroTicket } from "@/lib/caisse-base"
import { db } from "@/lib/db"
import { formaterNombre } from "@/lib/menus"

export const metadata: Metadata = { title: "Ticket de caisse" }

const f = (n: number): string => formaterNombre(n) + " FCFA"
const quand = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(d)

export default function Page({ params }: { params: Promise<{ numero: string }> }) {
  return (
    <Suspense fallback={null}>
      <Ticket params={params} />
    </Suspense>
  )
}

async function Ticket({ params }: { params: Promise<{ numero: string }> }) {
  const a = await accesCaisse()
  if (!a || !a.etab) return <p className="p-6 text-sm">Accès refusé.</p>
  const { numero } = await params
  const n = Number(numero)
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000_000) return <p className="p-6 text-sm">Ticket introuvable.</p>
  const v = await db.venteComptoir.findUnique({ where: { etablissementId_numero: { etablissementId: a.etab.id, numero: n } }, include: { lignes: true } })
  if (!v) return <p className="p-6 text-sm">Ticket introuvable.</p>
  const rendu = v.recu !== null && v.recu >= v.total ? v.recu - v.total : null
  return (
    <main data-testid="ticket-imprime" data-numero={v.numero} data-statut={v.statut} className="mx-auto w-[80mm] max-w-full space-y-3 bg-white p-4 font-mono text-xs text-neutral-900 print:p-0">
      <div className="text-center">
        <p className="text-sm font-semibold">{a.etab.name}</p>
        <p>Ticket {numeroTicket(v.numero)}</p>
        <p>{quand(v.createdAt)}</p>
        {v.statut === "ANNULEE" ? <p className="mt-1 border border-neutral-900 px-2 font-semibold">VENTE ANNULÉE</p> : null}
      </div>
      <ul className="space-y-1 border-y border-dashed border-neutral-500 py-2">
        {v.lignes.map((l) => (
          <li key={l.id} className="flex justify-between gap-2">
            <span className="min-w-0 flex-1">{l.quantite} × {l.libelle}</span>
            <span>{f(l.montant)}</span>
          </li>
        ))}
      </ul>
      {v.remise > 0 ? <p className="flex justify-between"><span>Remise</span><span data-remise={v.remise}>−{f(v.remise)}</span></p> : null}
      <p className="flex justify-between text-sm font-semibold"><span>Total</span><span data-testid="ticket-total" data-valeur={v.total}>{f(v.total)}</span></p>
      <p className="flex justify-between"><span>Paiement</span><span>{(MODES as Record<string, string>)[v.methode ?? "COMPTE"] ?? v.methode}</span></p>
      {v.recu !== null ? <p className="flex justify-between"><span>Reçu</span><span>{f(v.recu)}</span></p> : null}
      {rendu !== null && rendu > 0 ? <p className="flex justify-between"><span>Rendu</span><span data-rendu={rendu}>{f(rendu)}</span></p> : null}
      <p className="text-center text-neutral-500">Merci de votre visite</p>
      <div className="flex justify-center"><BoutonImprimer libelle="Imprimer le ticket" /></div>
    </main>
  )
}