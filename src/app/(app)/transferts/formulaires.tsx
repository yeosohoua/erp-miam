"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

import { creerTransfert } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const NB_LIGNES = 5

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormTransfert({ destinations, ingredients }: { destinations: Option[]; ingredients: Option[] }) {
  const [etat, action, attente] = useActionState(creerTransfert, undefined)
  return (
    <form action={action} noValidate data-testid="form-transfert" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Destination
          <select id="tr-dest" name="destId" defaultValue="" className={champ}>
            <option value="">Choisir…</option>
            {destinations.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Note (facultative)
          <input id="tr-note" name="note" maxLength={200} className={champ} />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: NB_LIGNES }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <select id={"tr-ing-" + i} name={"ing" + i} defaultValue="" aria-label={"Ingrédient " + (i + 1)} className={champ}>
              <option value="">Ingrédient {i + 1}</option>
              {ingredients.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input id={"tr-qte-" + i} name={"qte" + i} inputMode="decimal" placeholder="Quantité" aria-label={"Quantité " + (i + 1)} className={champ} />
          </div>
        ))}
      </div>
      <Message etat={etat} />
      <div>
        <Button type="submit" disabled={attente}>Préparer le transfert</Button>
      </div>
    </form>
  )
}

export function ActionTransfert({ action, label }: { action: (p: EtatAction, fd: FormData) => Promise<EtatAction>; label: string }) {
  const [etat, formAction, attente] = useActionState(action, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={attente}>{label}</Button>
      <Message etat={etat} />
    </form>
  )
}