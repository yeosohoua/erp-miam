"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TYPES_AIDE, ORDRE_TYPES_AIDE } from "@/lib/aides-base"
import type { EtatAction } from "@/lib/etat-action"

import { attribuerAide, creerAide } from "./actions"

const SELECT = "h-9 w-full rounded-md border bg-background px-3 text-sm"

function Retour({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" data-testid="msg-erreur" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" data-testid="msg-ok" className="text-sm text-emerald-600">{etat.ok}</p>
  return null
}

export function AideFormulaire() {
  const [etat, action, attente] = useActionState(creerAide, undefined)
  return (
    <form action={action} data-testid="form-aide" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="ai-nom">Nom de l&apos;aide</Label><Input id="ai-nom" name="nom" maxLength={60} required /></div>
      <div className="space-y-1">
        <Label htmlFor="ai-type">Type</Label>
        <select id="ai-type" name="type" className={SELECT} defaultValue="POURCENTAGE">
          {ORDRE_TYPES_AIDE.map((t) => <option key={t} value={t}>{TYPES_AIDE[t]}</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="ai-valeur">Valeur (% ou FCFA)</Label><Input id="ai-valeur" name="valeur" type="number" min={0} max={1000000} placeholder="50" /></div>
      <div className="space-y-1"><Label htmlFor="ai-description">Description</Label><Input id="ai-description" name="description" maxLength={200} placeholder="Conditions d'attribution" /></div>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={attente}>Créer l&apos;aide</Button>
        <Retour etat={etat} />
      </div>
    </form>
  )
}

export function AttributionFormulaire({ aides, aujourdhui }: { aides: { id: string; nom: string }[]; aujourdhui: string }) {
  const [etat, action, attente] = useActionState(attribuerAide, undefined)
  return (
    <form action={action} data-testid="form-attribution" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1"><Label htmlFor="at-identifiant">Matricule ou badge</Label><Input id="at-identifiant" name="identifiant" maxLength={64} required /></div>
      <div className="space-y-1">
        <Label htmlFor="at-aide">Aide</Label>
        <select id="at-aide" name="aide" className={SELECT} defaultValue={aides[0]?.id ?? ""}>
          {aides.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="at-debut">Début</Label><Input id="at-debut" name="debut" type="date" defaultValue={aujourdhui} /></div>
      <div className="space-y-1"><Label htmlFor="at-fin">Fin (facultative)</Label><Input id="at-fin" name="fin" type="date" /></div>
      <div className="space-y-1"><Label htmlFor="at-motif">Motif</Label><Input id="at-motif" name="motif" maxLength={200} placeholder="Dossier social, bourse…" /></div>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
        <Button type="submit" disabled={attente || aides.length === 0}>Attribuer</Button>
        <Retour etat={etat} />
      </div>
    </form>
  )
}