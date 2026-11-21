"use client"

import { useEffect, useRef, useState } from "react"

import { formaterNombre } from "@/lib/menus"
import { jouer, sonImpression } from "@/lib/sons-caisse"

export type TicketCaisse = {
  numero: number
  libelle: string
  etablissement: string
  date: string
  lignes: { nom: string; qty: number; total: number }[]
  total: number
  modeLibelle: string
  recu: number | null
  rendu: number | null
  remise: number
  solde: number | null
}

type Etape = "enregistrement" | "impression" | "pret"

const f = (n: number): string => formaterNombre(n) + " FCFA"
const DENTS = 20
const HAUTEUR_DENT = 10
const DECOUPE = (() => {
  const points = ["0 0", "100% 0"]
  for (let i = DENTS; i >= 0; i--) {
    points.push((i * 100) / DENTS + "% " + (i % 2 === 0 ? "calc(100% - " + HAUTEUR_DENT + "px)" : "100%"))
  }
  return "polygon(" + points.join(", ") + ")"
})()
const DEPART = "translateY(calc(-100% - 24px))"
const LIBELLES: Record<Etape, string> = {
  enregistrement: "Enregistrement de la vente…",
  impression: "Impression du ticket…",
  pret: "Ticket prêt",
}

// Imprimante de caisse : la vente est enregistree, puis le papier sort par paliers sous la fente.
export function RecuImprimante({ ticket, onNouvelle }: { ticket: TicketCaisse; onNouvelle: () => void }) {
  const [reduit] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [etape, setEtape] = useState<Etape>(reduit ? "pret" : "enregistrement")
  const papier = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduit) return
    let anim: Animation | undefined
    let arretSon: (() => void) | undefined
    const minuterie = window.setTimeout(() => {
      const el = papier.current
      if (!el) {
        setEtape("pret")
        return
      }
      setEtape("impression")
      arretSon = sonImpression(2000, 16)
      anim = el.animate([{ transform: DEPART }, { transform: "translateY(0)" }], { duration: 2000, easing: "steps(16, end)", fill: "forwards" })
      anim.onfinish = () => {
        setEtape("pret")
        jouer("ding")
      }
    }, 450)
    return () => {
      window.clearTimeout(minuterie)
      anim?.cancel()
      arretSon?.()
    }
  }, [reduit])

  const led = etape === "pret" ? "bg-green-500" : etape === "impression" ? "bg-amber-400 animate-pulse" : "bg-sky-400 animate-pulse"
  const zone = etape === "pret" ? "border-transparent" : "border-neutral-400/70 bg-muted/40"

  return (
    <div data-testid="recu-imprimante" data-ticket={ticket.libelle} data-etape={etape}>
      <div className="relative z-10 rounded-lg bg-neutral-800 p-3 text-neutral-100">
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-md bg-neutral-950 px-3 py-2 font-mono text-xs">
          <span className={"size-2 rounded-full " + led} />
          <span>{LIBELLES[etape]}</span>
        </div>
        <div className="mx-2 mt-3 h-1.5 rounded-full bg-black" />
      </div>

      <div data-recu-zone className={"-mt-1 mx-3 overflow-hidden rounded-b-lg border border-dashed px-2 pb-3 pt-2 transition-colors " + zone}>
        <div ref={papier} data-recu-papier style={{ filter: "drop-shadow(0 4px 5px rgb(0 0 0 / 0.22))", transform: reduit ? "none" : DEPART }}>
          <div style={{ clipPath: DECOUPE }} className="space-y-2 border-x border-neutral-300 bg-white px-4 pt-4 font-mono text-xs text-neutral-900">
            <div className="text-center">
              <p className="font-semibold">{ticket.etablissement}</p>
              <p>Ticket {ticket.libelle}</p>
              <p className="text-neutral-500">{ticket.date}</p>
            </div>
            <ul className="space-y-1 border-y border-dashed border-neutral-400 py-2">
              {ticket.lignes.map((l, i) => (
                <li key={i} data-recu-ligne className="flex justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{l.qty} × {l.nom}</span>
                  <span>{f(l.total)}</span>
                </li>
              ))}
            </ul>
            {ticket.remise > 0 ? <p className="flex justify-between"><span>Remise</span><span data-recu-remise={ticket.remise}>−{f(ticket.remise)}</span></p> : null}
            <p className="flex justify-between text-sm font-semibold"><span>Total</span><span data-recu-total={ticket.total}>{f(ticket.total)}</span></p>
            <p className="flex justify-between"><span>Paiement</span><span>{ticket.modeLibelle}</span></p>
            {ticket.recu !== null ? <p className="flex justify-between"><span>Reçu</span><span>{f(ticket.recu)}</span></p> : null}
            {ticket.rendu !== null && ticket.rendu > 0 ? <p className="flex justify-between"><span>Rendu</span><span data-recu-rendu={ticket.rendu}>{f(ticket.rendu)}</span></p> : null}
            {ticket.solde !== null ? <p className="flex justify-between"><span>Solde restant</span><span>{f(ticket.solde)}</span></p> : null}
            <p className="pb-8 text-center text-neutral-500">Merci de votre visite</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {ticket.numero > 0 ? <button type="button" onClick={() => window.open("/impression-ticket/" + ticket.numero, "_blank")} className="h-8 rounded-md border px-3">Imprimer le ticket</button> : null}
        <button type="button" onClick={onNouvelle} className="h-8 rounded-md bg-primary px-3 text-primary-foreground">Nouvelle vente</button>
      </div>
    </div>
  )
}