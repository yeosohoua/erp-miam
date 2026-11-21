"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

export function BasculeEtablissement({ action, active }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; active: boolean }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {active ? "Désactiver" : "Réactiver"}
      </Button>
      <Messages etat={etat} />
    </form>
  )
}