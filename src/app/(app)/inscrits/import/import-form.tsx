"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export function ImportForm({ action }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction> }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [texte, setTexte] = useState("")

  useEffect(() => {
    if (etat?.ok) setTexte("")
  }, [etat])

  const lireFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    void f.text().then((t) => setTexte(t))
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="import-fichier">Fichier CSV (facultatif, sinon collez le texte ci-dessous)</Label>
        <input id="import-fichier" type="file" accept=".csv,text/csv,text/plain" onChange={lireFichier} disabled={enCours} className="text-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="import-texte">Contenu</Label>
        <textarea
          id="import-texte"
          name="texte"
          rows={10}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          disabled={enCours}
          className="w-full rounded-md border bg-transparent p-3 font-mono text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Import en cours..." : "Importer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}