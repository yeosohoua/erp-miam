"use client"

import { useRef, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

export function RestaurationForm() {
  const fichierRef = useRef<HTMLInputElement>(null)
  const [mdp, setMdp] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [etat, setEtat] = useState<EtatAction>(undefined)
  const [enCours, setEnCours] = useState(false)

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fichier = fichierRef.current?.files?.[0]
    if (!fichier) return setEtat({ error: "Choisissez un fichier de sauvegarde." })
    if (confirmation !== "RESTAURER") return setEtat({ error: "Tapez RESTAURER pour confirmer." })
    setEnCours(true)
    setEtat(undefined)
    try {
      const fd = new FormData()
      fd.set("fichier", fichier)
      fd.set("motdepasse", mdp)
      fd.set("confirmation", confirmation)
      const rep = await fetch("/api/restauration", { method: "POST", body: fd })
      const data = (await rep.json().catch(() => ({ error: "Réponse inattendue du serveur." }))) as { ok?: string; error?: string }
      setEtat(data)
      if (rep.ok) {
        setMdp("")
        setConfirmation("")
        setTimeout(() => window.location.assign("/"), 2500)
      }
    } catch {
      setEtat({ error: "Échec de l'envoi du fichier." })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-4" data-testid="form-restauration">
      <div className="flex flex-col gap-2">
        <Label htmlFor="restore-fichier">Fichier de sauvegarde (.json)</Label>
        <input id="restore-fichier" ref={fichierRef} type="file" accept=".json,application/json" disabled={enCours} className="text-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="restore-mdp">Votre mot de passe</Label>
        <Input id="restore-mdp" type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} disabled={enCours} className="max-w-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="restore-confirm">Tapez RESTAURER pour confirmer</Label>
        <Input id="restore-confirm" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={enCours} className="max-w-sm" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={enCours}>
          {enCours ? "Restauration..." : "Restaurer la sauvegarde"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}