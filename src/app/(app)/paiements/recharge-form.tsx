"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { METHODES, ORDRE_METHODES } from "@/lib/paiements-base"

// Champs non controles : React vide le formulaire apres chaque envoi.
export function RechargeForm({ action, matricule }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; matricule?: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-recharge">
      {matricule ? (
        <input type="hidden" name="matricule" value={matricule} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-matricule">Matricule</Label>
          <Input id="rc-matricule" name="matricule" autoComplete="off" disabled={enCours} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="rc-montant">Montant</Label>
        <Input id="rc-montant" name="montant" inputMode="numeric" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rc-methode">Mode de paiement</Label>
        <select id="rc-methode" name="methode" defaultValue="CASH" className={classeSelect} disabled={enCours}>
          {ORDRE_METHODES.map((m) => (
            <option key={m} value={m}>
              {METHODES[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rc-reference">Référence Mobile Money</Label>
        <Input id="rc-reference" name="reference" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Enregistrer la recharge
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}