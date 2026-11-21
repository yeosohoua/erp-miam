"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EtatAction } from "@/lib/etat-action"

export function ReferentielForm({ kind, action }: { kind: string; action: (etat: EtatAction, fd: FormData) => Promise<EtatAction> }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [nom, setNom] = useState("")

  useEffect(() => {
    if (etat?.ok) setNom("")
  }, [etat])

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Input id={"ref-nom-" + kind} name="nom" aria-label="Nouvel élément" autoComplete="off" className="max-w-xs" value={nom} onChange={(e) => setNom(e.target.value)} disabled={enCours} />
      <Button type="submit" disabled={enCours}>
        Ajouter
      </Button>
      <Messages etat={etat} />
    </form>
  )
}