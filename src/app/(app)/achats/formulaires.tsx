"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>

export function FournisseurForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-fournisseur">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fo-name">Nom</Label>
        <Input id="fo-name" name="name" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fo-email">E-mail</Label>
        <Input id="fo-email" name="email" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fo-phone">Téléphone</Label>
        <Input id="fo-phone" name="phone" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fo-address">Adresse</Label>
        <Input id="fo-address" name="address" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Créer le fournisseur
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function BonForm({ action, fournisseurs }: { action: Action; fournisseurs: { id: string; name: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-bon">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bn-fournisseur">Fournisseur</Label>
        <select id="bn-fournisseur" name="fournisseurId" defaultValue="" className={classeSelect} disabled={enCours}>
          <option value="">— Choisir —</option>
          {fournisseurs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bn-note">Note</Label>
        <Input id="bn-note" name="note" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Créer le bon de commande
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function LigneForm({ action, ingredients }: { action: Action; ingredients: { id: string; name: string; unit: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-ligne">
      <div className="flex flex-col gap-2">
        <Label htmlFor="li-ingredient">Ingrédient</Label>
        <select id="li-ingredient" name="ingredientId" defaultValue="" className={classeSelect} disabled={enCours}>
          <option value="">— Choisir —</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="li-quantite">Quantité</Label>
        <Input id="li-quantite" name="quantite" inputMode="decimal" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="li-prix">Prix unitaire</Label>
        <Input id="li-prix" name="prix" inputMode="decimal" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Ajouter la ligne
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function ReceptionForm({ action, ingredient }: { action: Action; ingredient: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" data-testid="form-reception" data-ingredient={ingredient}>
      <Input name="quantite" placeholder="Quantité" inputMode="decimal" autoComplete="off" className="w-24" disabled={enCours} aria-label={"Quantité reçue " + ingredient} />
      <Input name="peremption" type="date" className="w-40" disabled={enCours} aria-label={"Péremption " + ingredient} />
      <Input name="reference" placeholder="N° de lot" autoComplete="off" className="w-28" disabled={enCours} aria-label={"Lot " + ingredient} />
      <Button type="submit" size="sm" disabled={enCours}>
        Réceptionner
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}