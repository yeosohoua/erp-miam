"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

const VIDE = { nom: "", relation: "", tel: "", email: "" }

export function TuteurForm({ action }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction> }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState(VIDE)
  const champ = (cle: keyof typeof VIDE) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [cle]: e.target.value }))

  useEffect(() => {
    if (etat?.ok) setV(VIDE)
  }, [etat])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" data-testid="form-tuteur">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tut-nom">Nom</Label>
        <Input id="tut-nom" name="nom" autoComplete="off" value={v.nom} onChange={champ("nom")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tut-relation">Lien (père, mère, tuteur…)</Label>
        <Input id="tut-relation" name="relation" autoComplete="off" value={v.relation} onChange={champ("relation")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tut-tel">Téléphone</Label>
        <Input id="tut-tel" name="tel" autoComplete="off" value={v.tel} onChange={champ("tel")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tut-email">E-mail (facultatif)</Label>
        <Input id="tut-email" name="email" autoComplete="off" value={v.email} onChange={champ("email")} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : "Ajouter le tuteur"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}