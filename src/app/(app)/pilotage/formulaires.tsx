"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

import { creerCleApi, definirObjectif } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormObjectif({ kpis }: { kpis: Option[] }) {
  const [etat, action, attente] = useActionState(definirObjectif, undefined)
  return (
    <form action={action} noValidate data-testid="form-objectif" className="grid gap-3 sm:grid-cols-3">
      <label className={etiquette}>
        Indicateur
        <select id="ob-kpi" name="kpi" defaultValue="" className={champ}>
          <option value="">Choisir…</option>
          {kpis.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Valeur cible
        <input id="ob-cible" name="cible" inputMode="decimal" className={champ} />
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={attente}>Enregistrer l&apos;objectif</Button>
      </div>
      <div className="sm:col-span-3">
        <Message etat={etat} />
      </div>
    </form>
  )
}

export function FormCle() {
  const [etat, action, attente] = useActionState(creerCleApi, undefined)
  return (
    <form action={action} noValidate data-testid="form-cle" className="flex flex-col gap-3">
      <label className={etiquette}>
        Nom de la clé (par exemple le système qui l&apos;utilisera)
        <input id="cl-nom" name="nom" className={champ} />
      </label>
      {etat?.error ? <p role="alert" className="text-sm text-destructive">{etat.error}</p> : null}
      {etat?.ok ? (
        <p role="status" data-testid="cle-creee" className="break-all rounded-md border border-green-600 bg-green-50 p-3 text-sm text-green-900">
          {etat.ok}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={attente}>Créer la clé</Button>
      </div>
    </form>
  )
}