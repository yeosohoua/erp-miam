"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>
type ActionSimple = (fd: FormData) => Promise<void>

export function AjoutForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-ajout-categorie">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cat-nom">Nouvelle catégorie</Label>
        <Input id="cat-nom" name="nom" maxLength={40} placeholder="Ex. Jus frais" disabled={enCours} className="w-64" />
      </div>
      <Button type="submit" disabled={enCours}>
        Ajouter
      </Button>
      <Messages etat={etat} />
    </form>
  )
}

export function SemerForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3" data-testid="form-semer-categories">
      <Button type="submit" variant="outline" disabled={enCours}>
        Ajouter les catégories usuelles
      </Button>
      <Messages etat={etat} />
    </form>
  )
}

export type LigneProps = { id: string; nom: string; ordre: number; active: boolean; articles: number; modifier: Action; basculer: ActionSimple; supprimer: ActionSimple }

export function LigneCategorie({ nom, ordre, active, articles, id, modifier, basculer, supprimer }: LigneProps) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(modifier, undefined)
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="categorie" data-categorie={nom} data-active={active ? "1" : "0"}>
      <div className="flex flex-wrap items-end gap-3">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={"n-" + id}>Nom</Label>
            <Input id={"n-" + id} name="nom" defaultValue={nom} maxLength={40} disabled={enCours} className="w-56" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={"o-" + id}>Ordre</Label>
            <Input id={"o-" + id} name="ordre" type="number" min={0} max={999} defaultValue={ordre} disabled={enCours} className="w-24" />
          </div>
          <Button type="submit" size="sm" disabled={enCours}>
            Enregistrer
          </Button>
        </form>
        <form action={basculer}>
          <Button type="submit" size="sm" variant="outline">
            {active ? "Désactiver" : "Activer"}
          </Button>
        </form>
        <form action={supprimer}>
          <Button type="submit" size="sm" variant="outline">
            Supprimer
          </Button>
        </form>
        <span className="text-xs text-muted-foreground">
          {articles} article(s){active ? "" : " · masquée dans l'application"}
        </span>
      </div>
      <Messages etat={etat} />
    </div>
  )
}