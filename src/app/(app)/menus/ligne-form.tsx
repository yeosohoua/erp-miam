"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export function LigneForm({ action, ingredients }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; ingredients: { id: string; name: string; unit: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [ingredient, setIngredient] = useState("")
  const [quantite, setQuantite] = useState("")

  useEffect(() => {
    if (etat?.ok) setQuantite("")
  }, [etat])

  if (ingredients.length === 0) return <p className="text-sm text-muted-foreground">Créez d&apos;abord des ingrédients (onglet Ingrédients).</p>

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-3" data-testid="form-ligne">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ligne-ingredient">Ingrédient</Label>
        <select id="ligne-ingredient" name="ingredient" value={ingredient} onChange={(e) => setIngredient(e.target.value)} disabled={enCours} className={classeSelect}>
          <option value="">— Choisir —</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ligne-qte">Quantité pour la recette</Label>
        <Input id="ligne-qte" name="quantite" inputMode="decimal" autoComplete="off" value={quantite} onChange={(e) => setQuantite(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={enCours}>
          Ajouter l&apos;ingrédient
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}