"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { DEVISES, TYPES_ETABLISSEMENT } from "@/lib/etablissements"

export type EtabValeurs = { code: string; nom: string; type: string; adresse: string; tel: string; email: string; devise: string }

const VIDE: EtabValeurs = { code: "", nom: "", type: "SCHOOL", adresse: "", tel: "", email: "", devise: "XOF" }

export function EtablissementForm({
  mode,
  action,
  valeurs,
}: {
  mode: "creation" | "edition"
  action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>
  valeurs?: EtabValeurs
}) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState<EtabValeurs>(valeurs ?? VIDE)
  const maj = (cle: keyof EtabValeurs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [cle]: e.target.value }))

  useEffect(() => {
    if (mode === "creation" && etat?.ok) setV(VIDE)
  }, [etat, mode])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" data-testid={mode === "creation" ? "form-etablissement" : "form-etablissement-edition"}>
      {mode === "creation" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="etab-code">Code (court, unique)</Label>
          <Input id="etab-code" name="code" autoComplete="off" value={v.code} onChange={maj("code")} disabled={enCours} />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-nom">Nom</Label>
        <Input id="etab-nom" name="nom" autoComplete="off" value={v.nom} onChange={maj("nom")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-type">Type</Label>
        <select id="etab-type" name="type" value={v.type} onChange={maj("type")} disabled={enCours} className={classeSelect}>
          {Object.entries(TYPES_ETABLISSEMENT).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-devise">Devise</Label>
        <select id="etab-devise" name="devise" value={v.devise} onChange={maj("devise")} disabled={enCours} className={classeSelect}>
          {DEVISES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-adresse">Adresse (facultative)</Label>
        <Input id="etab-adresse" name="adresse" autoComplete="off" value={v.adresse} onChange={maj("adresse")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-tel">Téléphone (facultatif)</Label>
        <Input id="etab-tel" name="tel" autoComplete="off" value={v.tel} onChange={maj("tel")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etab-email">E-mail (facultatif)</Label>
        <Input id="etab-email" name="email" autoComplete="off" value={v.email} onChange={maj("email")} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : mode === "creation" ? "Créer l'établissement" : "Enregistrer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}