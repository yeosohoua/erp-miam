"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { rembourserVente } from "./actions"

export function RemboursementFormulaire({ venteId, reste }: { venteId: string; reste: number }) {
  const [etat, action, attente] = useActionState(rembourserVente.bind(null, venteId), undefined)
  return (
    <form action={action} noValidate data-testid="form-remboursement" className="flex flex-wrap items-center gap-1">
      <Input name="montant" inputMode="numeric" placeholder={"≤ " + reste} aria-label="Montant à rembourser" className="h-8 w-24" />
      <Input name="motif" maxLength={200} placeholder="Motif" aria-label="Motif du remboursement" className="h-8 w-32" />
      <Button type="submit" size="sm" variant="outline" disabled={attente}>Rembourser</Button>
      {etat?.error ? <p role="alert" data-testid="msg-erreur" className="w-full text-xs text-destructive">{etat.error}</p> : null}
      {etat?.ok ? <p role="status" data-testid="msg-ok" className="w-full text-xs text-emerald-600">{etat.ok}</p> : null}
    </form>
  )
}