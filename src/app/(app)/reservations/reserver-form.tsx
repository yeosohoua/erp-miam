"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

// Champ non controle : React vide le formulaire apres chaque envoi, l'affichage reste coherent.
export function ReserverForm({ action, service }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; service: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-reserver">
      <div className="flex flex-col gap-2">
        <Label htmlFor={"res-matricule-" + service}>Matricule</Label>
        <Input id={"res-matricule-" + service} name="matricule" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Réserver
      </Button>
      <Messages etat={etat} />
    </form>
  )
}