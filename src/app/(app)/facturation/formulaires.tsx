"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { METHODES, ORDRE_METHODES } from "@/lib/paiements-base"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>

// Champs non controles : React vide chaque formulaire apres l'envoi.
export function GenerationForm({ action, defaut }: { action: Action; defaut: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-generation">
      <div className="flex flex-col gap-2">
        <Label htmlFor="gen-periode">Mois à facturer</Label>
        <Input id="gen-periode" name="periode" type="month" defaultValue={defaut} max={defaut} disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Générer les factures
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function ClientForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-client">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-name">Nom</Label>
        <Input id="cl-name" name="name" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-email">E-mail</Label>
        <Input id="cl-email" name="email" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-phone">Téléphone</Label>
        <Input id="cl-phone" name="phone" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cl-address">Adresse</Label>
        <Input id="cl-address" name="address" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Créer le client
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function RattacherForm({ action, clients }: { action: Action; clients: { id: string; name: string }[] }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-rattacher">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rt-matricule">Matricule</Label>
        <Input id="rt-matricule" name="matricule" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rt-client">Client payeur</Label>
        <select id="rt-client" name="clientId" defaultValue="" className={classeSelect} disabled={enCours}>
          <option value="">Aucun (détacher)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={enCours}>
        Rattacher
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function EmissionForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-emission">
      <div className="flex flex-col gap-2">
        <Label htmlFor="em-delai">Délai de paiement (jours)</Label>
        <Input id="em-delai" name="delai" inputMode="numeric" defaultValue="30" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Émettre la facture
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function EncaissementForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-encaisser">
      <div className="flex flex-col gap-2">
        <Label htmlFor="enc-montant">Montant</Label>
        <Input id="enc-montant" name="montant" inputMode="numeric" autoComplete="off" disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="enc-methode">Mode de paiement</Label>
        <select id="enc-methode" name="methode" defaultValue="CASH" className={classeSelect} disabled={enCours}>
          {ORDRE_METHODES.map((m) => (
            <option key={m} value={m}>
              {METHODES[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="enc-reference">Référence Mobile Money</Label>
        <Input id="enc-reference" name="reference" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" disabled={enCours}>
        Enregistrer le règlement
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function RelanceForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-relance">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rel-note">Note (facultative)</Label>
        <Input id="rel-note" name="note" autoComplete="off" disabled={enCours} />
      </div>
      <Button type="submit" variant="outline" disabled={enCours}>
        Enregistrer la relance
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function BoutonImprimer() {
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      Imprimer
    </Button>
  )
}