"use client"

import { useTransition } from "react"

import { choisirEtablissement } from "@/lib/etablissement-actions"

type Option = { id: string; name: string }

export function SelecteurEtablissement({ liste, courantId }: { liste: Option[]; courantId: string | null }) {
  const [enCours, demarrer] = useTransition()

  if (liste.length <= 1) {
    return (
      <span data-testid="etab-nom" className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
        {liste[0]?.name ?? "Aucun établissement"}
      </span>
    )
  }
  return (
    <select
      id="etab-select"
      data-testid="etab-switch"
      aria-label="Établissement actif"
      value={courantId ?? ""}
      disabled={enCours}
      onChange={(e) => {
        const id = e.target.value
        demarrer(async () => {
          await choisirEtablissement(id)
        })
      }}
      className="h-8 max-w-56 rounded-md border bg-transparent px-2 text-sm"
    >
      {liste.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  )
}