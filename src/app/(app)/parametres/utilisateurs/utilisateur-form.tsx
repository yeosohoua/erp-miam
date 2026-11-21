"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { LIBELLES_ROLES, ROLE_VALUES } from "@/lib/roles"

type Etab = { id: string; code: string; name: string }
type Valeurs = { nom: string; email: string; role: string; mdp: string; actif: boolean; etabs: string[] }
const VIDE: Valeurs = { nom: "", email: "", role: "MANAGER", mdp: "", actif: true, etabs: [] }

export function UtilisateurForm({
  mode,
  action,
  etablissements,
  valeurs,
}: {
  mode: "creation" | "edition"
  action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>
  etablissements: Etab[]
  valeurs?: Valeurs
}) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState<Valeurs>(valeurs ?? VIDE)

  useEffect(() => {
    if (mode === "creation" && etat?.ok) setV(VIDE)
  }, [etat, mode])

  const basculer = (id: string) =>
    setV((p) => ({ ...p, etabs: p.etabs.includes(id) ? p.etabs.filter((e) => e !== id) : [...p.etabs, id] }))

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" data-testid={mode === "creation" ? "form-utilisateur" : "form-utilisateur-edition"}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="usr-nom">Nom</Label>
        <Input id="usr-nom" name="nom" autoComplete="off" value={v.nom} onChange={(e) => setV((p) => ({ ...p, nom: e.target.value }))} disabled={enCours} />
      </div>
      {mode === "creation" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="usr-email">Adresse e-mail</Label>
          <Input id="usr-email" name="email" autoComplete="off" value={v.email} onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))} disabled={enCours} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Adresse e-mail</Label>
          <p className="flex h-9 items-center text-sm text-muted-foreground">{v.email}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="usr-role">Rôle</Label>
        <select id="usr-role" name="role" value={v.role} onChange={(e) => setV((p) => ({ ...p, role: e.target.value }))} disabled={enCours} className={classeSelect}>
          {ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {LIBELLES_ROLES[r]}
            </option>
          ))}
        </select>
      </div>
      {mode === "creation" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="usr-mdp">Mot de passe initial</Label>
          <Input id="usr-mdp" name="mdp" type="password" autoComplete="new-password" value={v.mdp} onChange={(e) => setV((p) => ({ ...p, mdp: e.target.value }))} disabled={enCours} />
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-6">
          <input id="usr-actif" name="actif" type="checkbox" checked={v.actif} onChange={(e) => setV((p) => ({ ...p, actif: e.target.checked }))} disabled={enCours} />
          <Label htmlFor="usr-actif">Compte actif</Label>
        </div>
      )}
      <fieldset className="flex flex-col gap-2 md:col-span-2">
        <legend className="text-sm font-medium">Établissements affectés (l&apos;administrateur voit tout)</legend>
        <div className="flex flex-wrap gap-4">
          {etablissements.map((e) => (
            <label key={e.id} htmlFor={"usr-etab-" + e.code} className="flex items-center gap-2 text-sm">
              <input id={"usr-etab-" + e.code} name="etab" type="checkbox" value={e.id} checked={v.etabs.includes(e.id)} onChange={() => basculer(e.id)} disabled={enCours} />
              {e.name} <span className="font-mono text-xs text-muted-foreground">({e.code})</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : mode === "creation" ? "Créer l'utilisateur" : "Enregistrer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function ReinitialisationForm({ action }: { action: (etat: EtatAction, fd: FormData) => Promise<EtatAction> }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [mdp, setMdp] = useState("")
  const [confirmation, setConfirmation] = useState("")

  useEffect(() => {
    if (etat?.ok) {
      setMdp("")
      setConfirmation("")
    }
  }, [etat])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" data-testid="form-reinitialisation">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-mdp">Nouveau mot de passe</Label>
        <Input id="reset-mdp" name="mdp" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-confirmation">Confirmation</Label>
        <Input id="reset-confirmation" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={enCours} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" variant="outline" disabled={enCours}>
          {enCours ? "Enregistrement..." : "Réinitialiser le mot de passe"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}