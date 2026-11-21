"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

type Plat = { id: string; name: string }

export function AvisRepas({ action, plats }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; plats: Plat[] }) {
  const [etat, act, attente] = useActionState(action, undefined)
  const champ = "h-9 rounded-md border bg-background px-2 text-sm"
  return (
    <form action={act} data-testid="form-avis-repas" className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select name="note" defaultValue="" aria-label="Note" className={champ}>
          <option value="">Note…</option>
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Bien</option>
          <option value="3">3 — Moyen</option>
          <option value="2">2 — Décevant</option>
          <option value="1">1 — Mauvais</option>
        </select>
        <select name="platId" defaultValue="" aria-label="Plat" className={champ}>
          <option value="">Le repas en général</option>
          {plats.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input name="commentaire" type="text" aria-label="Commentaire" placeholder="Commentaire (facultatif)" className={champ + " min-w-56 flex-1"} />
        <Button type="submit" size="sm" disabled={attente}>
          Envoyer mon avis
        </Button>
      </div>
      {etat?.error ? <p role="alert" className="text-sm text-destructive">{etat.error}</p> : null}
      {etat?.ok ? <p role="status" className="text-sm text-green-700">{etat.ok}</p> : null}
    </form>
  )
}