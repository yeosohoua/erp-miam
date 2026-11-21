"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { JOURNAUX, LISTE_COMPTES, ORDRE_JOURNAUX } from "@/lib/compta-base"
import type { EtatAction } from "@/lib/etat-action"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>

export function ComptabiliserForm({ action, attente }: { action: Action; attente: number }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3" data-testid="form-comptabiliser">
      <Button type="submit" disabled={enCours}>
        Comptabiliser maintenant
      </Button>
      <span className="text-sm text-muted-foreground">{attente > 0 ? attente + " pièce(s) en attente de comptabilisation" : "Tout est comptabilisé"}</span>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

function Comptes({ id, name, defaut, desactive }: { id: string; name: string; defaut: string; desactive: boolean }) {
  return (
    <select id={id} name={name} defaultValue={defaut} className={classeSelect} disabled={desactive}>
      {LISTE_COMPTES.map((c) => (
        <option key={c.numero} value={c.numero}>
          {c.numero} — {c.libelle}
        </option>
      ))}
    </select>
  )
}

export function SaisieForm({ action, defaut }: { action: Action; defaut: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-saisie">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-date">Date</Label>
        <Input id="sa-date" name="date" type="date" defaultValue={defaut} max={defaut} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-journal">Journal</Label>
        <select id="sa-journal" name="journal" defaultValue="OD" className={classeSelect} disabled={enCours}>
          {ORDRE_JOURNAUX.map((j) => (
            <option key={j} value={j}>
              {JOURNAUX[j]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-piece">Pièce</Label>
        <Input id="sa-piece" name="piece" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex min-w-60 flex-1 flex-col gap-2">
        <Label htmlFor="sa-libelle">Libellé</Label>
        <Input id="sa-libelle" name="libelle" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-debit">Compte débité</Label>
        <Comptes id="sa-debit" name="debit" defaut="401" desactive={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-credit">Compte crédité</Label>
        <Comptes id="sa-credit" name="credit" defaut="571" desactive={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sa-montant">Montant</Label>
        <Input id="sa-montant" name="montant" inputMode="numeric" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Enregistrer l&apos;écriture
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function ContrepasseForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        Contrepasser
      </Button>
      {etat?.error ? <span className="text-xs text-destructive">{etat.error}</span> : null}
      {etat?.ok ? <span className="text-xs text-muted-foreground">{etat.ok}</span> : null}
    </form>
  )
}

export function ClotureForm({ action, defaut }: { action: Action; defaut: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-cloture">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-periode">Mois à clôturer</Label>
        <Input id="cl-periode" name="periode" type="month" defaultValue={defaut} disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Clôturer la période
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}