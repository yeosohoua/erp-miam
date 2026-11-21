"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { ORDRE_SERVICES, SERVICES } from "@/lib/menus"
import { ORDRE_TYPES_EVENEMENT, ORDRE_TYPES_GASPILLAGE, TYPES_EVENEMENT, TYPES_GASPILLAGE } from "@/lib/prevision-base"

import { ajouterEvenement, fixerPlan, genererBon, saisirGaspillage } from "./actions"

const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

function Retour({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" data-testid="msg-erreur" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" data-testid="msg-ok" className="text-sm text-emerald-600">{etat.ok}</p>
  return null
}

export function PlanFormulaire({ date, service, valeur }: { date: string; service: string; valeur: number | null }) {
  const [etat, action, attente] = useActionState(fixerPlan.bind(null, date, service), undefined)
  return (
    <form action={action} className="flex items-center gap-2">
      <Input id={`pl-${date}-${service}`} name="aProduire" type="number" min={0} max={100000} defaultValue={valeur ?? ""} className="h-8 w-24" aria-label="Quantité à produire" />
      <Button type="submit" size="sm" variant="outline" disabled={attente}>OK</Button>
      <Retour etat={etat} />
    </form>
  )
}

export function EvenementFormulaire() {
  const [etat, action, attente] = useActionState(ajouterEvenement, undefined)
  return (
    <form action={action} data-testid="form-evenement" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1"><Label htmlFor="ev-type">Type</Label>
        <select id="ev-type" name="type" className={sel} defaultValue="EVENEMENT">
          {ORDRE_TYPES_EVENEMENT.map((t) => <option key={t} value={t}>{TYPES_EVENEMENT[t]}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="ev-debut">Début</Label><Input id="ev-debut" name="debut" type="date" required /></div>
      <div className="space-y-1"><Label htmlFor="ev-fin">Fin</Label><Input id="ev-fin" name="fin" type="date" /></div>
      <div className="space-y-1"><Label htmlFor="ev-impact">Impact (%)</Label><Input id="ev-impact" name="impact" type="number" min={-100} max={500} required /></div>
      <div className="space-y-1"><Label htmlFor="ev-libelle">Libellé</Label><Input id="ev-libelle" name="libelle" maxLength={80} required /></div>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
        <Button type="submit" disabled={attente}>Ajouter</Button>
        <Retour etat={etat} />
      </div>
    </form>
  )
}

export function GaspillageFormulaire({ plats, aujourdhui }: { plats: { id: string; nom: string }[]; aujourdhui: string }) {
  const [etat, action, attente] = useActionState(saisirGaspillage, undefined)
  return (
    <form action={action} data-testid="form-gaspillage" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="space-y-1"><Label htmlFor="ga-date">Date</Label><Input id="ga-date" name="date" type="date" max={aujourdhui} defaultValue={aujourdhui} required /></div>
      <div className="space-y-1"><Label htmlFor="ga-service">Service</Label>
        <select id="ga-service" name="service" className={sel} defaultValue="LUNCH">
          {ORDRE_SERVICES.map((s) => <option key={s} value={s}>{SERVICES[s]}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="ga-plat">Plat</Label>
        <select id="ga-plat" name="platId" className={sel} defaultValue="">
          <option value="">Choisir…</option>
          {plats.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="ga-portions">Portions</Label><Input id="ga-portions" name="portions" type="number" min={1} max={10000} required /></div>
      <div className="space-y-1"><Label htmlFor="ga-type">Type</Label>
        <select id="ga-type" name="type" className={sel} defaultValue="RESTE_ASSIETTE">
          {ORDRE_TYPES_GASPILLAGE.map((t) => <option key={t} value={t}>{TYPES_GASPILLAGE[t]}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="ga-note">Note</Label><Input id="ga-note" name="note" maxLength={200} /></div>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
        <Button type="submit" disabled={attente}>Enregistrer</Button>
        <Retour etat={etat} />
      </div>
    </form>
  )
}

export function BonFormulaire({ fournisseurs, jours }: { fournisseurs: { id: string; nom: string }[]; jours: number }) {
  const [etat, action, attente] = useActionState(genererBon, undefined)
  return (
    <form action={action} data-testid="form-bon" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="jours" value={jours} />
      <div className="space-y-1"><Label htmlFor="bo-fournisseur">Fournisseur</Label>
        <select id="bo-fournisseur" name="fournisseurId" className={sel} defaultValue="">
          <option value="">Choisir…</option>
          {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select></div>
      <Button type="submit" disabled={attente}>Générer le bon de commande</Button>
      <Retour etat={etat} />
    </form>
  )
}