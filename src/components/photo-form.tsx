"use client"

import { useActionState, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"
import { reduireImage } from "@/lib/image-client"

function initiales(nom: string): string {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?"
}

type Props = {
  imageId: string | null
  nom: string
  televerser: (etat: EtatAction, fd: FormData) => Promise<EtatAction>
  retirer: (fd: FormData) => Promise<void>
  max?: number
  rond?: boolean
}

// rond : portrait (photo d'une personne, recadree en cercle). Sinon : image entiere, jamais coupee (plat, article, logo).
export function PhotoForm({ imageId, nom, televerser, retirer, max = 320, rond = true }: Props) {
  const [etat, action] = useActionState(televerser, undefined)
  const [local, setLocal] = useState<string | null>(null)
  const [attente, demarrer] = useTransition()
  return (
    <div className="flex items-center gap-4" data-testid="photo-form">
      {rond ? (
        imageId ? (
          <img data-testid="photo-apercu" src={"/api/images/" + imageId} alt={"Photo de " + nom} className="size-20 rounded-full border object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-full border bg-muted text-xl font-medium text-muted-foreground">{initiales(nom)}</span>
        )
      ) : imageId ? (
        <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          <img data-testid="photo-apercu" src={"/api/images/" + imageId} alt={"Image de " + nom} className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <span aria-hidden="true" className="flex h-24 w-36 items-center justify-center rounded-xl border border-dashed bg-muted/40 text-xs text-muted-foreground">Aucune image</span>
      )}
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choisir une image"
          data-testid="photo-input"
          disabled={attente}
          className="max-w-64 text-sm"
          onChange={async (e) => {
            const champ = e.currentTarget
            const fichier = champ.files?.[0]
            if (!fichier) return
            setLocal(null)
            const blob = await reduireImage(fichier, max)
            champ.value = ""
            if (!blob) {
              setLocal("Image illisible ou trop lourde.")
              return
            }
            const fd = new FormData()
            fd.set("image", new File([blob], "image", { type: blob.type }))
            demarrer(() => {
              action(fd)
            })
          }}
        />
        {local ? <p role="alert" data-testid="photo-erreur" className="text-sm text-destructive">{local}</p> : null}
        {!local && etat?.error ? <p role="alert" data-testid="photo-erreur" className="text-sm text-destructive">{etat.error}</p> : null}
        {!local && etat?.ok ? <p role="status" className="text-sm text-emerald-600">{etat.ok}</p> : null}
        {imageId ? (
          <form action={retirer}>
            <Button type="submit" variant="outline" size="sm">{rond ? "Retirer la photo" : "Retirer l'image"}</Button>
          </form>
        ) : null}
      </div>
    </div>
  )
}