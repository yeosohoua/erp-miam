"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

export function BoutonAction({ action, label, variant = "outline" }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; label: string; variant?: "outline" | "ghost" }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button type="submit" size="sm" variant={variant} disabled={enCours}>
        {label}
      </Button>
      <Messages etat={etat} />
    </form>
  )
}