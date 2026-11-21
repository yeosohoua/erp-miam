"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"
import { LIBELLES_CERTIFICATION, LIBELLES_CONGE, LIBELLES_POINTAGE, TYPES_CERTIFICATION, TYPES_CONGE, STATUTS_POINTAGE } from "@/lib/rh-avance-base"

import { ajouterCertification, demanderConge, enregistrerPointage } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

function ChoixEmploye({ id, employes }: { id: string; employes: Option[] }) {
  return (
    <label className={etiquette}>
      Employé
      <select id={id} name="employeId" defaultValue="" className={champ}>
        <option value="">Choisir…</option>
        {employes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FormConge({ employes }: { employes: Option[] }) {
  const [etat, action, attente] = useActionState(demanderConge, undefined)
  return (
    <form action={action} data-testid="form-conge" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ChoixEmploye id="cg-employe" employes={employes} />
      <label className={etiquette}>
        Type
        <select id="cg-type" name="type" defaultValue="ANNUEL" className={champ}>
          {TYPES_CONGE.map((t) => (
            <option key={t} value={t}>
              {LIBELLES_CONGE[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Premier jour
        <input id="cg-debut" name="debut" type="date" className={champ} />
      </label>
      <label className={etiquette}>
        Dernier jour
        <input id="cg-fin" name="fin" type="date" className={champ} />
      </label>
      <label className={etiquette + " sm:col-span-2"}>
        Motif (facultatif)
        <input id="cg-motif" name="motif" type="text" maxLength={200} className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <div>
          <Button type="submit" disabled={attente}>
            Demander
          </Button>
        </div>
        <Message etat={etat} />
      </div>
    </form>
  )
}

export function FormPointage({ employes, jour }: { employes: Option[]; jour: string }) {
  const [etat, action, attente] = useActionState(enregistrerPointage, undefined)
  return (
    <form action={action} data-testid="form-pointage" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ChoixEmploye id="pt-employe" employes={employes} />
      <label className={etiquette}>
        Date
        <input id="pt-date" name="date" type="date" defaultValue={jour} className={champ} />
      </label>
      <label className={etiquette}>
        Statut
        <select id="pt-statut" name="statut" defaultValue="PRESENT" className={champ}>
          {STATUTS_POINTAGE.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_POINTAGE[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Retard (minutes)
        <input id="pt-retard" name="retard" type="number" min={0} max={480} className={champ} />
      </label>
      <label className={etiquette + " sm:col-span-2"}>
        Note (facultatif)
        <input id="pt-note" name="note" type="text" maxLength={200} className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <div>
          <Button type="submit" disabled={attente}>
            Enregistrer
          </Button>
        </div>
        <Message etat={etat} />
      </div>
    </form>
  )
}

export function FormCertification({ employes }: { employes: Option[] }) {
  const [etat, action, attente] = useActionState(ajouterCertification, undefined)
  return (
    <form action={action} data-testid="form-certification" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ChoixEmploye id="ce-employe" employes={employes} />
      <label className={etiquette}>
        Type
        <select id="ce-type" name="type" defaultValue="HACCP" className={champ}>
          {TYPES_CERTIFICATION.map((t) => (
            <option key={t} value={t}>
              {LIBELLES_CERTIFICATION[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Délivrée le
        <input id="ce-delivree" name="delivreeLe" type="date" className={champ} />
      </label>
      <label className={etiquette}>
        Expire le
        <input id="ce-expire" name="expireLe" type="date" className={champ} />
      </label>
      <label className={etiquette + " sm:col-span-2"}>
        Organisme (facultatif)
        <input id="ce-organisme" name="organisme" type="text" maxLength={80} className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <div>
          <Button type="submit" disabled={attente}>
            Ajouter
          </Button>
        </div>
        <Message etat={etat} />
      </div>
    </form>
  )
}