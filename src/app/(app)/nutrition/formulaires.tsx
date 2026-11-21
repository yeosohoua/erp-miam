"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

import { creerBrouillons, enregistrerValeurs, importerReference } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormValeurs({ ingredients }: { ingredients: Option[] }) {
  const [etat, action, attente] = useActionState(enregistrerValeurs, undefined)
  return (
    <form action={action} noValidate data-testid="form-valeurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={etiquette}>
        Ingrédient
        <select id="nu-ingredient" name="ingredientId" defaultValue="" className={champ}>
          <option value="">Choisir…</option>
          {ingredients.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Énergie (kcal / 100 g)
        <input id="nu-kcal" name="kcal" inputMode="numeric" className={champ} />
      </label>
      <label className={etiquette}>
        Protéines (g / 100 g)
        <input id="nu-proteines" name="proteines" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Glucides (g / 100 g)
        <input id="nu-glucides" name="glucides" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Lipides (g / 100 g)
        <input id="nu-lipides" name="lipides" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Fibres (g / 100 g)
        <input id="nu-fibres" name="fibres" inputMode="decimal" className={champ} />
      </label>
      <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-3">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Enregistrer les valeurs</Button>
        </div>
      </div>
    </form>
  )
}

export function FormImport() {
  const [etat, action, attente] = useActionState(importerReference, undefined)
  return (
    <form action={action} data-testid="form-import" className="flex flex-col gap-2">
      <Message etat={etat} />
      <div>
        <Button type="submit" variant="outline" disabled={attente}>Importer les valeurs de référence</Button>
      </div>
    </form>
  )
}

export function FormBrouillons({ service, debut, budget, exclus }: { service: string; debut: string; budget: string; exclus: string[] }) {
  const [etat, action, attente] = useActionState(creerBrouillons, undefined)
  return (
    <form action={action} data-testid="form-brouillons" className="flex flex-col gap-2">
      <input type="hidden" name="service" value={service} />
      <input type="hidden" name="debut" value={debut} />
      <input type="hidden" name="budget" value={budget} />
      {exclus.map((e) => (
        <input key={e} type="hidden" name="exclus" value={e} />
      ))}
      <Message etat={etat} />
      <div>
        <Button type="submit" disabled={attente}>Créer ces menus en brouillon</Button>
      </div>
    </form>
  )
}