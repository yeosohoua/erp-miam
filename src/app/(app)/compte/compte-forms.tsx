"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

import { changerMotDePasse, modifierProfil } from "./actions"

export function ProfilForm({ nom }: { nom: string }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(modifierProfil, undefined)
  const [valeur, setValeur] = useState(nom)
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profil-nom">Nom</Label>
        <Input id="profil-nom" name="nom" autoComplete="name" value={valeur} onChange={(e) => setValeur(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : "Enregistrer le profil"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function MotDePasseForm() {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(changerMotDePasse, undefined)
  const [actuel, setActuel] = useState("")
  const [nouveau, setNouveau] = useState("")
  const [confirmation, setConfirmation] = useState("")

  useEffect(() => {
    if (etat?.ok) {
      setActuel("")
      setNouveau("")
      setConfirmation("")
    }
  }, [etat])

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="mdp-actuel">Mot de passe actuel</Label>
        <Input id="mdp-actuel" name="actuel" type="password" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mdp-nouveau">Nouveau mot de passe</Label>
        <Input id="mdp-nouveau" name="nouveau" type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mdp-confirmation">Confirmation</Label>
        <Input id="mdp-confirmation" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : "Changer le mot de passe"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}