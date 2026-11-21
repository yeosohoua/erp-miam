"use client"

import { useActionState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { ORDRE_SITUATIONS, SITUATIONS } from "@/lib/paie-base"

type Action = (etat: EtatAction, fd: FormData) => Promise<EtatAction>

export type EmployeForm = { matricule: string; firstName: string; lastName: string; poste: string; dateEmbauche: string; salaireBase: number; primes: number; indemniteExoneree: number; situation: string; enfants: number; personnesCmu: number; telephone: string }

function Champ({ id, label, children, large }: { id: string; label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={"flex flex-col gap-2" + (large ? " min-w-60 flex-1" : "")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

export function EmployeFormulaire({ action, employe, aujourdhui }: { action: Action; employe?: EmployeForm; aujourdhui: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const e = employe
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-employe">
      <Champ id="em-matricule" label="Matricule">
        <Input id="em-matricule" name="matricule" defaultValue={e?.matricule ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-prenom" label="Prénom">
        <Input id="em-prenom" name="firstName" defaultValue={e?.firstName ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-nom" label="Nom">
        <Input id="em-nom" name="lastName" defaultValue={e?.lastName ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-poste" label="Poste" large>
        <Input id="em-poste" name="poste" defaultValue={e?.poste ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-embauche" label="Date d'embauche">
        <Input id="em-embauche" name="dateEmbauche" type="date" defaultValue={e?.dateEmbauche ?? aujourdhui} max={aujourdhui} disabled={enCours} />
      </Champ>
      <Champ id="em-base" label="Salaire de base">
        <Input id="em-base" name="salaireBase" inputMode="numeric" defaultValue={e?.salaireBase ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-primes" label="Primes imposables">
        <Input id="em-primes" name="primes" inputMode="numeric" defaultValue={e?.primes ?? 0} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-exo" label="Indemnité exonérée">
        <Input id="em-exo" name="indemniteExoneree" inputMode="numeric" defaultValue={e?.indemniteExoneree ?? 0} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-situation" label="Situation familiale">
        <select id="em-situation" name="situation" defaultValue={e?.situation ?? "CELIBATAIRE"} className={classeSelect} disabled={enCours}>
          {ORDRE_SITUATIONS.map((s) => (
            <option key={s} value={s}>
              {SITUATIONS[s]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ id="em-enfants" label="Enfants à charge">
        <Input id="em-enfants" name="enfants" inputMode="numeric" defaultValue={e?.enfants ?? 0} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-cmu" label="Personnes couvertes (CMU)">
        <Input id="em-cmu" name="personnesCmu" inputMode="numeric" defaultValue={e?.personnesCmu ?? 1} autoComplete="off" disabled={enCours} />
      </Champ>
      <Champ id="em-tel" label="Téléphone">
        <Input id="em-tel" name="telephone" defaultValue={e?.telephone ?? ""} autoComplete="off" disabled={enCours} />
      </Champ>
      <Button type="submit" disabled={enCours}>
        {e ? "Mettre à jour" : "Ajouter l'employé"}
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export function PeriodeFormulaire({ action, defaut, bouton, testid, id }: { action: Action; defaut: string; bouton: string; testid: string; id: string }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid={testid}>
      <Champ id={id} label="Mois">
        <Input id={id} name="periode" type="month" defaultValue={defaut} disabled={enCours} />
      </Champ>
      <Button type="submit" disabled={enCours}>
        {bouton}
      </Button>
      <div className="w-full">
        <Messages etat={etat} />
      </div>
    </form>
  )
}

export type ParametresForm = Record<string, string | boolean>

const POURCENTS: [string, string][] = [
  ["retraiteSalarie", "Retraite salarié (%)"],
  ["retraitePatronal", "Retraite employeur (%)"],
  ["pf", "Prestations familiales (%)"],
  ["maternite", "Maternité (%)"],
  ["at", "Accident du travail (%)"],
  ["contribution", "Contribution employeur (%)"],
  ["apprentissage", "Taxe d'apprentissage (%)"],
  ["tfpc", "Formation continue (%)"],
]
const MONTANTS: [string, string][] = [
  ["plafondRetraite", "Plafond retraite"],
  ["plafondAutres", "Plafond autres branches"],
  ["plancher", "Plancher de cotisation"],
  ["cmuSalarie", "CMU salarié (par personne)"],
  ["cmuPatronale", "CMU employeur (par personne)"],
  ["ricfDemiPart", "Réduction par demi-part"],
]

export function ParametresFormulaire({ action, valeurs, lecture }: { action: Action; valeurs: ParametresForm; lecture: boolean }) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const off = enCours || lecture
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="form-parametres">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {POURCENTS.map(([k, l]) => (
          <Champ key={k} id={"pa-" + k} label={l}>
            <Input id={"pa-" + k} name={k} inputMode="decimal" defaultValue={String(valeurs[k])} autoComplete="off" disabled={off} />
          </Champ>
        ))}
        {MONTANTS.map(([k, l]) => (
          <Champ key={k} id={"pa-" + k} label={l}>
            <Input id={"pa-" + k} name={k} inputMode="numeric" defaultValue={String(valeurs[k])} autoComplete="off" disabled={off} />
          </Champ>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="pa-cnpsDeductibleIts" name="cnpsDeductibleIts" type="checkbox" defaultChecked={valeurs.cnpsDeductibleIts === true} disabled={off} />
        Cotisations CNPS déductibles de la base de l&apos;ITS
      </label>
      {lecture ? (
        <p className="text-sm text-muted-foreground">Seuls l&apos;administrateur, le gestionnaire et le comptable modifient ces paramètres.</p>
      ) : (
        <div>
          <Button type="submit" disabled={off}>
            Enregistrer les paramètres
          </Button>
        </div>
      )}
      <Messages etat={etat} />
    </form>
  )
}