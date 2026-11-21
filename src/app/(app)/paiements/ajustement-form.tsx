"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export function AjustementForm({ action }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction> }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-ajustement">
      <div className="flex flex-col gap-2">
        <Label htmlFor="aj-montant">Montant (négatif pour retirer)</Label>
        <Input id="aj-montant" name="montant" inputMode="numeric" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex min-w-64 flex-1 flex-col gap-2">
        <Label htmlFor="aj-motif">Motif</Label>
        <Input id="aj-motif" name="motif" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" variant="outline" disabled={enCours}>
        Enregistrer l&apos;ajustement
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}