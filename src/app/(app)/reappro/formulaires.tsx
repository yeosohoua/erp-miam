"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

import { enregistrerRegle, genererBons } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormRegle({ ingredients, fournisseurs }: { ingredients: Option[]; fournisseurs: Option[] }) {
  const [etat, action, attente] = useActionState(enregistrerRegle, undefined)
  return (
    <form action={action} noValidate data-testid="form-regle" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className={etiquette}>
        Ingrédient
        <select id="rg-ingredient" name="ingredientId" defaultValue="" className={champ}>
          <option value="">Choisir…</option>
          {ingredients.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Stock cible
        <input id="rg-cible" name="cible" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Fournisseur habituel
        <select id="rg-fournisseur" name="fournisseurId" defaultValue="" className={champ}>
          <option value="">Aucun</option>
          {fournisseurs.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Délai de livraison (jours)
        <input id="rg-delai" name="delaiJours" inputMode="numeric" defaultValue="2" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Enregistrer la règle</Button>
        </div>
      </div>
    </form>
  )
}

export function FormGenerer() {
  const [etat, action, attente] = useActionState(genererBons, undefined)
  return (
    <form action={action} data-testid="form-generer" className="flex flex-col gap-2">
      <Message etat={etat} />
      <div>
        <Button type="submit" disabled={attente}>Générer les bons en brouillon</Button>
      </div>
    </form>
  )
}