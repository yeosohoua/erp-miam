"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { ORDRE_SERVICES, SERVICES } from "@/lib/menus"

export function TarifsForm({ action, prix, prepaye }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; prix: Record<string, number>; prepaye: boolean }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="form-tarifs">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ORDRE_SERVICES.map((s) => (
          <div key={s} className="flex flex-col gap-2">
            <Label htmlFor={"prix-" + s}>{SERVICES[s]}</Label>
            <Input id={"prix-" + s} name={"prix_" + s} inputMode="numeric" defaultValue={String(prix[s] ?? 0)} autoComplete="off" disabled={enCours} />
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="prepaye" type="checkbox" name="prepaye" defaultChecked={prepaye} className="size-4" disabled={enCours} />
        Débiter automatiquement le compte prépayé à chaque repas servi
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enCours}>
          Enregistrer les tarifs
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}