"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"

import { corrigerNonConformite, creerEquipement, creerNonConformite, creerTache, creerTemoin, enregistrerReleve } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormEquipement({ types }: { types: Option[] }) {
  const [etat, action, attente] = useActionState(creerEquipement, undefined)
  return (
    <form action={action} noValidate data-testid="form-equipement" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className={etiquette}>
        Nom de l&apos;équipement
        <input id="eq-nom" name="nom" className={champ} />
      </label>
      <label className={etiquette}>
        Type
        <select id="eq-type" name="type" defaultValue={types[0]?.value ?? ""} className={champ}>
          {types.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Température minimale (°C)
        <input id="eq-min" name="tempMin" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Température maximale (°C)
        <input id="eq-max" name="tempMax" inputMode="decimal" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Ajouter l&apos;équipement</Button>
        </div>
      </div>
    </form>
  )
}

export function FormReleve({ equipements }: { equipements: Option[] }) {
  const [etat, action, attente] = useActionState(enregistrerReleve, undefined)
  return (
    <form action={action} noValidate data-testid="form-releve" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={etiquette}>
        Équipement
        <select id="rl-equipement" name="equipementId" defaultValue="" className={champ}>
          <option value="">Choisir…</option>
          {equipements.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Température relevée (°C)
        <input id="rl-valeur" name="valeur" inputMode="decimal" className={champ} />
      </label>
      <label className={etiquette}>
        Action corrective (obligatoire si hors plage)
        <input id="rl-action" name="action" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Enregistrer le relevé</Button>
        </div>
      </div>
    </form>
  )
}

export function FormTache({ frequences }: { frequences: Option[] }) {
  const [etat, action, attente] = useActionState(creerTache, undefined)
  return (
    <form action={action} noValidate data-testid="form-tache" className="grid gap-3 sm:grid-cols-3">
      <label className={etiquette}>
        Intitulé de la tâche
        <input id="tc-nom" name="nom" className={champ} />
      </label>
      <label className={etiquette}>
        Fréquence
        <select id="tc-frequence" name="frequence" defaultValue={frequences[0]?.value ?? ""} className={champ}>
          {frequences.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Zone (facultatif)
        <input id="tc-zone" name="zone" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Ajouter la tâche</Button>
        </div>
      </div>
    </form>
  )
}

export function FormNc({ gravites }: { gravites: Option[] }) {
  const [etat, action, attente] = useActionState(creerNonConformite, undefined)
  return (
    <form action={action} noValidate data-testid="form-nc" className="grid gap-3 sm:grid-cols-3">
      <label className={etiquette}>
        Titre
        <input id="nc-titre" name="titre" className={champ} />
      </label>
      <label className={etiquette}>
        Gravité
        <select id="nc-gravite" name="gravite" defaultValue={gravites[0]?.value ?? ""} className={champ}>
          {gravites.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Détail (facultatif)
        <input id="nc-detail" name="detail" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Déclarer la non-conformité</Button>
        </div>
      </div>
    </form>
  )
}

export function FormCorrection({ id }: { id: string }) {
  const [etat, action, attente] = useActionState(corrigerNonConformite.bind(null, id), undefined)
  return (
    <form action={action} noValidate data-testid="form-correction" className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input name="action" placeholder="Action corrective" className={champ} />
        <Button type="submit" size="sm" disabled={attente}>Enregistrer la correction</Button>
      </div>
      <Message etat={etat} />
    </form>
  )
}

export function FormTemoin({ services, jour }: { services: Option[]; jour: string }) {
  const [etat, action, attente] = useActionState(creerTemoin, undefined)
  return (
    <form action={action} noValidate data-testid="form-temoin" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className={etiquette}>
        Date du repas
        <input id="tm-date" name="date" type="date" defaultValue={jour} className={champ} />
      </label>
      <label className={etiquette}>
        Service
        <select id="tm-service" name="service" defaultValue={services[0]?.value ?? ""} className={champ}>
          {services.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Plat
        <input id="tm-plat" name="platNom" className={champ} />
      </label>
      <label className={etiquette}>
        Emplacement (facultatif)
        <input id="tm-emplacement" name="emplacement" className={champ} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Message etat={etat} />
        <div>
          <Button type="submit" disabled={attente}>Enregistrer l&apos;échantillon</Button>
        </div>
      </div>
    </form>
  )
}