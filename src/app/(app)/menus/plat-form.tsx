"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export type PlatValeurs = { nom: string; description: string; portions: string; actif: boolean }
const VIDE: PlatValeurs = { nom: "", description: "", portions: "1", actif: true }

// Reduit l'image avant l'envoi (640 px max, proportions gardees) : aucune coupure, fichier leger.
async function reduire(fichier: File, max: number): Promise<File> {
  try {
    const bmp = await createImageBitmap(fichier)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k))
    const h = Math.max(1, Math.round(bmp.height * k))
    const toile = document.createElement("canvas")
    toile.width = w
    toile.height = h
    const ctx = toile.getContext("2d")
    if (!ctx) return fichier
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => toile.toBlob(r, "image/webp", 0.85))
    return blob ? new File([blob], "plat.webp", { type: "image/webp" }) : fichier
  } catch {
    return fichier
  }
}

export function PlatForm({ mode, action, valeurs }: { mode: "creation" | "edition"; action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>; valeurs?: PlatValeurs }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState<PlatValeurs>(valeurs ?? VIDE)
  const [cle, setCle] = useState(0)

  useEffect(() => {
    if (mode === "creation" && etat?.ok) {
      setV(VIDE)
      setCle((c) => c + 1)
    }
  }, [etat, mode])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-3" data-testid={mode === "creation" ? "form-plat" : "form-plat-edition"}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="plat-nom">Nom du plat</Label>
        <Input id="plat-nom" name="nom" autoComplete="off" value={v.nom} onChange={(e) => setV((p) => ({ ...p, nom: e.target.value }))} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="plat-desc">Description (facultative)</Label>
        <Input id="plat-desc" name="description" autoComplete="off" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="plat-portions">Portions produites par la recette</Label>
        <Input id="plat-portions" name="portions" inputMode="numeric" autoComplete="off" value={v.portions} onChange={(e) => setV((p) => ({ ...p, portions: e.target.value }))} disabled={enCours} />
      </div>
      {mode === "creation" ? (
        <div className="flex flex-col gap-2 md:col-span-3">
          <Label htmlFor="plat-image">Image du plat (facultative)</Label>
          <Input
            key={cle}
            id="plat-image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={enCours}
            onChange={async (e) => {
              const champ = e.currentTarget
              const f = champ.files?.[0]
              if (!f) return
              const reduite = await reduire(f, 640)
              const lot = new DataTransfer()
              lot.items.add(reduite)
              champ.files = lot.files
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP : l&apos;image est réduite automatiquement et affichée en entier.</p>
        </div>
      ) : null}
      {mode === "edition" ? (
        <div className="flex items-center gap-2 md:col-span-3">
          <input id="plat-actif" name="actif" type="checkbox" checked={v.actif} onChange={(e) => setV((p) => ({ ...p, actif: e.target.checked }))} disabled={enCours} />
          <Label htmlFor="plat-actif">Plat actif (proposable dans les menus)</Label>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : mode === "creation" ? "Créer le plat" : "Enregistrer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}