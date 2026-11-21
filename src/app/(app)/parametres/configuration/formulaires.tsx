"use client"

import { useActionState } from "react"

import { Messages } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>
export type ChampConfig = { cle: string; libelle: string; aide: string; exemple: string; secret: boolean; source: "ENV" | "BASE" | "AUCUNE"; valeur: string }

function Statut({ c }: { c: ChampConfig }) {
  if (c.source === "ENV") return <span className="text-xs text-muted-foreground">Défini par le serveur (.env), modifiable seulement dans ce fichier</span>
  if (c.source === "BASE") return <span className="text-xs text-emerald-600">{c.secret ? "Enregistré (chiffré)" : "Enregistré"}</span>
  return <span className="text-xs text-muted-foreground">Non défini</span>
}

// Champs non controles : React vide le formulaire apres l'envoi. Un secret n'est jamais renvoye au navigateur.
export function GroupeForm({ id, champs, action }: { id: string; champs: ChampConfig[]; action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={"form-" + id}>
      {champs.map((c) => (
        <div key={c.cle} className="flex flex-col gap-1" data-cle={c.cle} data-source={c.source}>
          <Label htmlFor={"cf-" + c.cle}>
            {c.libelle} <span className="font-mono text-xs text-muted-foreground">{c.cle}</span>
          </Label>
          {c.source === "ENV" ? null : (
            <Input
              id={"cf-" + c.cle}
              name={c.cle}
              type={c.secret ? "password" : "text"}
              defaultValue={c.secret ? "" : c.valeur}
              placeholder={c.secret ? (c.source === "BASE" ? "Laisser vide pour conserver" : "") : c.exemple}
              autoComplete={c.secret ? "new-password" : "off"}
              disabled={enCours}
              className="max-w-xl"
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Statut c={c} />
            {c.secret && c.source === "BASE" ? (
              <label htmlFor={"ef-" + c.cle} className="flex items-center gap-1 text-xs">
                <input id={"ef-" + c.cle} name={"effacer-" + c.cle} type="checkbox" className="size-3.5" disabled={enCours} />
                Effacer
              </label>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{c.aide}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={"mdp-" + id}>Votre mot de passe (obligatoire pour modifier)</Label>
          <Input id={"mdp-" + id} name="motdepasse" type="password" autoComplete="current-password" disabled={enCours} className="w-64" />
        </div>
        <Button type="submit" disabled={enCours}>
          Enregistrer
        </Button>
      </div>
      <Messages etat={etat} />
    </form>
  )
}