"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { CANAUX, EVENEMENTS, ORDRE_CANAUX, type Reglages } from "@/lib/notifications-base"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>

function Case({ id, nom, defaut, libelle, enCours }: { id: string; nom: string; defaut: boolean; libelle: string; enCours: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} name={nom} type="checkbox" defaultChecked={defaut} disabled={enCours} className="size-4" />
      {libelle}
    </label>
  )
}

// Champs non controles : React vide le formulaire apres l'envoi, les valeurs viennent des props rechargees.
export function ReglagesForm({ action, reglages }: { action: Action; reglages: Reglages }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-5" data-testid="form-reglages">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Canaux utilisés</p>
        <div className="flex flex-wrap gap-5">
          <Case id="rg-sms" nom="sms" defaut={reglages.sms} libelle={CANAUX.SMS} enCours={enCours} />
          <Case id="rg-whatsapp" nom="whatsapp" defaut={reglages.whatsapp} libelle={CANAUX.WHATSAPP} enCours={enCours} />
          <Case id="rg-email" nom="email" defaut={reglages.email} libelle={CANAUX.EMAIL} enCours={enCours} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Événements notifiés</p>
        <div className="flex flex-wrap gap-5">
          <Case id="rg-relances" nom="relances" defaut={reglages.relances} libelle={EVENEMENTS.RELANCE + " (client payeur)"} enCours={enCours} />
          <Case id="rg-recharges" nom="recharges" defaut={reglages.recharges} libelle={EVENEMENTS.RECHARGE + " (tuteurs)"} enCours={enCours} />
          <Case id="rg-solde-bas" nom="soldeBas" defaut={reglages.soldeBas} libelle={EVENEMENTS.SOLDE_BAS + " (tuteurs)"} enCours={enCours} />
          <Case id="rg-repas" nom="repasServi" defaut={reglages.repasServi} libelle={EVENEMENTS.REPAS_SERVI + " (tuteurs)"} enCours={enCours} />
          <Case id="rg-stock" nom="alertesStock" defaut={reglages.alertesStock} libelle={EVENEMENTS.STOCK + " (personnel, e-mail)"} enCours={enCours} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rg-seuil">Seuil de solde bas</Label>
        <Input id="rg-seuil" name="seuil" inputMode="numeric" defaultValue={String(reglages.seuilSoldeBas)} autoComplete="off" disabled={enCours} className="w-40" />
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={enCours}>
          Enregistrer les réglages
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function TestForm({ action }: { action: Action }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-test">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nt-canal">Canal</Label>
        <select id="nt-canal" name="canal" defaultValue="EMAIL" className={classeSelect} disabled={enCours}>
          {ORDRE_CANAUX.map((c) => (
            <option key={c} value={c}>
              {CANAUX[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nt-dest">Destinataire (numéro ou e-mail)</Label>
        <Input id="nt-dest" name="destinataire" autoComplete="off" disabled={enCours} className="w-72" />
      </div>
      <Button type="submit" disabled={enCours}>
        Envoyer le message test
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}