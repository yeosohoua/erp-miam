"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export function AjoutPlatMenuForm({ action, plats }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; plats: { id: string; name: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [plat, setPlat] = useState("")

  useEffect(() => {
    if (etat?.ok) setPlat("")
  }, [etat])

  if (plats.length === 0) return <p className="text-sm text-muted-foreground">Aucun plat actif disponible à ajouter (onglet Plats).</p>

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-ajout-plat">
      <div className="flex flex-col gap-2">
        <Label htmlFor="menu-plat">Plat</Label>
        <select id="menu-plat" name="plat" value={plat} onChange={(e) => setPlat(e.target.value)} disabled={enCours} className={classeSelect + " min-w-64"}>
          <option value="">— Choisir —</option>
          {plats.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={enCours}>
        Ajouter au menu
      </Button>
      <Messages etat={etat} />
    </form>
  )
}