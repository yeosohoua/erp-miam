"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { ORDRE_SERVICES, SERVICES } from "@/lib/menus"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>
type Ing = { id: string; name: string; unit: string }

function ChoixIngredient({ id, ingredients, enCours }: { id: string; ingredients: Ing[]; enCours: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Ingrédient</Label>
      <select id={id} name="ingredientId" defaultValue="" className={classeSelect} disabled={enCours}>
        <option value="">— Choisir —</option>
        {ingredients.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.unit})
          </option>
        ))}
      </select>
    </div>
  )
}

export function SeuilForm({ action, ingredients }: { action: Action; ingredients: Ing[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-seuil">
      <ChoixIngredient id="sl-ingredient" ingredients={ingredients} enCours={enCours} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="sl-seuil">Seuil d&apos;alerte</Label>
        <Input id="sl-seuil" name="seuil" inputMode="decimal" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Définir le seuil
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function AjustementStockForm({ action, ingredients }: { action: Action; ingredients: Ing[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-ajustement-stock">
      <ChoixIngredient id="aj-ingredient" ingredients={ingredients} enCours={enCours} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="aj-type">Opération</Label>
        <select id="aj-type" name="type" defaultValue="INVENTAIRE" className={classeSelect} disabled={enCours}>
          <option value="INVENTAIRE">Inventaire (quantité comptée)</option>
          <option value="PERTE">Perte (quantité perdue)</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="aj-quantite">Quantité</Label>
        <Input id="aj-quantite" name="quantite" inputMode="decimal" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="aj-note">Motif</Label>
        <Input id="aj-note" name="note" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Enregistrer
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function ConsommationForm({ action, defaut }: { action: Action; defaut: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-consommation">
      <div className="flex flex-col gap-2">
        <Label htmlFor="co-date">Date</Label>
        <Input id="co-date" name="date" type="date" defaultValue={defaut} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="co-service">Service</Label>
        <select id="co-service" name="service" defaultValue="LUNCH" className={classeSelect} disabled={enCours}>
          {ORDRE_SERVICES.map((s) => (
            <option key={s} value={s}>
              {SERVICES[s]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={enCours}>
        Décompter la consommation
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}