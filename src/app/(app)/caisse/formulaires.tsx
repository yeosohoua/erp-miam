"use client"

import { useActionState, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

import { creerArticle, majPrixArticle } from "./actions"
import { televerserImageArticle } from "./images-actions"
import { cloturerCaisse, ouvrirCaisse } from "./session-actions"

function Retour({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" data-testid="msg-erreur" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" data-testid="msg-ok" className="text-sm text-emerald-600">{etat.ok}</p>
  return null
}

export function ArticleFormulaire() {
  const [etat, action, attente] = useActionState(creerArticle, undefined)
  return (
    <form action={action} data-testid="form-article" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="ar-nom">Nom</Label><Input id="ar-nom" name="nom" maxLength={60} required /></div>
      <div className="space-y-1"><Label htmlFor="ar-prix">Prix</Label><Input id="ar-prix" name="prix" type="number" min={1} max={1000000} required /></div>
      <div className="space-y-1"><Label htmlFor="ar-categorie">Catégorie</Label><Input id="ar-categorie" name="categorie" maxLength={40} placeholder="Boissons, Snacks…" /></div>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={attente}>Ajouter l&apos;article</Button>
      </div>
      <div className="sm:col-span-2 lg:col-span-4"><Retour etat={etat} /></div>
    </form>
  )
}

export function PrixFormulaire({ id, prix }: { id: string; prix: number }) {
  const [etat, action, attente] = useActionState(majPrixArticle.bind(null, id), undefined)
  return (
    <form action={action} className="flex items-center gap-2">
      <Input id={`pr-${id}`} name="prix" type="number" min={1} max={1000000} defaultValue={prix} className="h-8 w-28" aria-label="Prix" />
      <Button type="submit" size="sm" variant="outline" disabled={attente}>OK</Button>
      <Retour etat={etat} />
    </form>
  )
}

export function OuvrirFormulaire() {
  const [etat, action, attente] = useActionState(ouvrirCaisse, undefined)
  return (
    <form action={action} noValidate data-testid="form-ouverture" className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="oc-fond">Fond de caisse (FCFA)</Label>
        <Input id="oc-fond" name="fond" inputMode="numeric" placeholder="0" className="w-44" />
      </div>
      <Button type="submit" disabled={attente}>Ouvrir la caisse</Button>
      <div className="w-full"><Retour etat={etat} /></div>
    </form>
  )
}

export function CloturerFormulaire({ id }: { id: string }) {
  const [etat, action, attente] = useActionState(cloturerCaisse.bind(null, id), undefined)
  return (
    <form action={action} noValidate data-testid="form-cloture" className="flex flex-wrap items-center gap-2">
      <Input name="compte" inputMode="numeric" placeholder="Espèces comptées" aria-label="Espèces comptées" className="h-8 w-40" />
      <Input name="note" maxLength={200} placeholder="Note (facultative)" aria-label="Note de clôture" className="h-8 w-48" />
      <Button type="submit" size="sm" variant="outline" disabled={attente}>Clôturer la caisse</Button>
      <Retour etat={etat} />
    </form>
  )
}

// Reduit l'image dans le navigateur (480 px au plus, WebP ou JPEG) avant l'envoi : rapide meme sur une connexion lente.
async function reduire(fichier: File): Promise<Blob | null> {
  if (fichier.size > 15 * 1024 * 1024) return null
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(fichier)
  } catch {
    return null
  }
  const ratio = Math.min(1, 480 / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * ratio))
  const h = Math.max(1, Math.round(bmp.height * ratio))
  const toile = document.createElement("canvas")
  toile.width = w
  toile.height = h
  const ctx = toile.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const produire = (type: string, qualite: number) => new Promise<Blob | null>((resolve) => toile.toBlob(resolve, type, qualite))
  let blob = await produire("image/webp", 0.82)
  if (!blob || blob.type !== "image/webp") blob = await produire("image/jpeg", 0.85)
  return blob && blob.size <= 600 * 1024 ? blob : null
}

export function ImageArticle({ id, imageId, nom }: { id: string; imageId: string | null; nom: string }) {
  const [etat, action] = useActionState(televerserImageArticle.bind(null, id), undefined)
  const [local, setLocal] = useState<string | null>(null)
  const [attente, demarrer] = useTransition()
  return (
    <div className="flex items-center gap-2">
      {imageId ? <img src={"/api/images/" + imageId} alt="" className="size-10 rounded-md bg-muted object-contain" data-testid="article-miniature" /> : <span className="flex size-10 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">—</span>}
      <div className="flex flex-col gap-1">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={"Image de " + nom}
          data-testid="image-input"
          disabled={attente}
          className="max-w-48 text-xs"
          onChange={async (e) => {
            const champ = e.currentTarget
            const fichier = champ.files?.[0]
            if (!fichier) return
            setLocal(null)
            const blob = await reduire(fichier)
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
        {local ? <p role="alert" data-testid="msg-erreur" className="text-xs text-destructive">{local}</p> : <Retour etat={etat} />}
      </div>
    </div>
  )
}