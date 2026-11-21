"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

// Liste non controlee : React la remet a "Choisir" apres chaque envoi, l'affichage reste coherent.
export function GroupeForm({ action, service, groupes }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; service: string; groupes: { id: string; name: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  if (groupes.length === 0) return null

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-groupe">
      <div className="flex flex-col gap-2">
        <Label htmlFor={"res-groupe-" + service}>Groupe entier</Label>
        <select id={"res-groupe-" + service} name="groupe" defaultValue="" disabled={enCours} className={classeSelect + " min-w-48"}>
          <option value="">— Choisir —</option>
          {groupes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={enCours}>
        Réserver le groupe
      </Button>
      <Messages etat={etat} />
    </form>
  )
}