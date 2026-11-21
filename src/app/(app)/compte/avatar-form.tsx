"use client"

import { useActionState, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { reduireImage } from "@/lib/image-client"

import { retirerAvatar, televerserAvatar } from "./avatar-actions"

function initiales(nom: string): string {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?"
}

export function AvatarForm({ imageId, nom }: { imageId: string | null; nom: string }) {
  const [etat, action] = useActionState(televerserAvatar, undefined)
  const [local, setLocal] = useState<string | null>(null)
  const [attente, demarrer] = useTransition()
  return (
    <div className="flex items-center gap-4">
      {imageId ? (
        <img data-testid="avatar-apercu" src={"/api/images/" + imageId} alt="" className="size-16 rounded-full border object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border bg-muted text-lg font-medium text-muted-foreground">{initiales(nom)}</span>
      )}
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choisir une photo de profil"
          data-testid="avatar-input"
          disabled={attente}
          className="max-w-64 text-sm"
          onChange={async (e) => {
            const champ = e.currentTarget
            const fichier = champ.files?.[0]
            if (!fichier) return
            setLocal(null)
            const blob = await reduireImage(fichier, 256)
            champ.value = ""
            if (!blob) {
              setLocal("Image illisible ou trop lourde.")
              return
            }
            const fd = new FormData()
            fd.set("image", new File([blob], "avatar", { type: blob.type }))
            demarrer(() => {
              action(fd)
            })
          }}
        />
        {local ? <p role="alert" data-testid="avatar-erreur" className="text-sm text-destructive">{local}</p> : null}
        {!local && etat?.error ? <p role="alert" data-testid="avatar-erreur" className="text-sm text-destructive">{etat.error}</p> : null}
        {!local && etat?.ok ? <p role="status" className="text-sm text-emerald-600">{etat.ok}</p> : null}
        {imageId ? (
          <form action={retirerAvatar}>
            <Button type="submit" variant="outline" size="sm">Retirer la photo</Button>
          </form>
        ) : null}
      </div>
    </div>
  )
}