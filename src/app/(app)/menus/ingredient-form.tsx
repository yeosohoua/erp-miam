"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { UNITES } from "@/lib/menus"

export type IngredientValeurs = { nom: string; unite: string; cout: string; allergenes: string[] }
const VIDE: IngredientValeurs = { nom: "", unite: "kg", cout: "", allergenes: [] }

export function IngredientForm({
  mode,
  action,
  allergies,
  devise,
  valeurs,
}: {
  mode: "creation" | "edition"
  action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>
  allergies: { id: string; name: string }[]
  devise: string
  valeurs?: IngredientValeurs
}) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState<IngredientValeurs>(valeurs ?? VIDE)
  const basculer = (id: string) => setV((p) => ({ ...p, allergenes: p.allergenes.includes(id) ? p.allergenes.filter((a) => a !== id) : [...p.allergenes, id] }))

  useEffect(() => {
    if (mode === "creation" && etat?.ok) setV(VIDE)
  }, [etat, mode])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-3" data-testid={mode === "creation" ? "form-ingredient" : "form-ingredient-edition"}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ing-nom">Nom</Label>
        <Input id="ing-nom" name="nom" autoComplete="off" value={v.nom} onChange={(e) => setV((p) => ({ ...p, nom: e.target.value }))} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ing-unite">Unité</Label>
        <select id="ing-unite" name="unite" value={v.unite} onChange={(e) => setV((p) => ({ ...p, unite: e.target.value }))} disabled={enCours} className={classeSelect}>
          {UNITES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ing-cout">Coût par unité ({devise})</Label>
        <Input id="ing-cout" name="cout" inputMode="decimal" autoComplete="off" value={v.cout} onChange={(e) => setV((p) => ({ ...p, cout: e.target.value }))} disabled={enCours} />
      </div>
      <fieldset className="flex flex-col gap-2 md:col-span-3">
        <legend className="text-sm font-medium">Allergènes contenus</legend>
        {allergies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune allergie dans le référentiel (menu Inscrits &gt; Référentiels).</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {allergies.map((a) => (
              <label key={a.id} htmlFor={"ing-all-" + a.id} className="flex items-center gap-2 text-sm">
                <input id={"ing-all-" + a.id} name="allergenes" type="checkbox" value={a.id} checked={v.allergenes.includes(a.id)} onChange={() => basculer(a.id)} disabled={enCours} />
                {a.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : mode === "creation" ? "Créer l'ingrédient" : "Enregistrer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}