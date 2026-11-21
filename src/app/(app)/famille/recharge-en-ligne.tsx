"use client"

import { useActionState, useEffect, useRef } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatRecharge } from "@/lib/etat-recharge"

const MONTANTS = [1000, 2000, 5000, 10000]

export function RechargeEnLigne({ action }: { action: (etat: EtatRecharge, fd: FormData) => Promise<EtatRecharge> }) {
  const [etat, formAction, enCours] = useActionState<EtatRecharge, FormData>(action, undefined)
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (etat?.url) window.location.assign(etat.url)
  }, [etat])

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="form-recharge-en-ligne">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rl-montant">Montant à recharger (F CFA)</Label>
          <Input id="rl-montant" ref={champ} name="montant" inputMode="numeric" autoComplete="off" disabled={enCours} />
        </div>
        <Button type="submit" disabled={enCours}>
          Payer avec Paystack
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {MONTANTS.map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (champ.current) champ.current.value = String(n)
            }}
          >
            {n.toLocaleString("fr-FR")}
          </Button>
        ))}
      </div>
      <Messages etat={etat} />
    </form>
  )
}