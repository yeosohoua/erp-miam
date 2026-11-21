"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EtatAction } from "@/lib/etat-action"
import { LIBELLES_SOURCE, SOURCES_AVIS } from "@/lib/satisfaction-base"

import { enregistrerAvis, proposerSuggestion } from "./actions"

export type Option = { value: string; label: string }
const champ = "h-9 w-full rounded-md border bg-background px-3 text-sm"
const etiquette = "flex flex-col gap-1 text-sm"

function Message({ etat }: { etat: EtatAction }) {
  if (etat?.error) return <p role="alert" className="text-sm text-destructive">{etat.error}</p>
  if (etat?.ok) return <p role="status" className="text-sm text-green-700">{etat.ok}</p>
  return null
}

export function FormAvis({ plats, services, jour }: { plats: Option[]; services: Option[]; jour: string }) {
  const [etat, action, attente] = useActionState(enregistrerAvis, undefined)
  return (
    <form action={action} data-testid="form-avis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={etiquette}>
        Date du repas
        <input id="av-date" name="date" type="date" defaultValue={jour} className={champ} />
      </label>
      <label className={etiquette}>
        Service
        <select id="av-service" name="service" defaultValue={services[0]?.value ?? ""} className={champ}>
          {services.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Plat (facultatif)
        <select id="av-plat" name="platId" defaultValue="" className={champ}>
          <option value="">Repas en général</option>
          {plats.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Note
        <select id="av-note" name="note" defaultValue="" className={champ}>
          <option value="">Choisir…</option>
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Bien</option>
          <option value="3">3 — Moyen</option>
          <option value="2">2 — Décevant</option>
          <option value="1">1 — Mauvais</option>
        </select>
      </label>
      <label className={etiquette}>
        Source
        <select id="av-source" name="source" defaultValue="COMPTOIR" className={champ}>
          {SOURCES_AVIS.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_SOURCE[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={etiquette}>
        Auteur (facultatif)
        <input id="av-auteur" name="auteur" type="text" maxLength={60} className={champ} />
      </label>
      <label className={etiquette + " sm:col-span-2 lg:col-span-3"}>
        Commentaire (facultatif)
        <textarea id="av-commentaire" name="commentaire" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <div>
          <Button type="submit" disabled={attente}>
            Enregistrer l&apos;avis
          </Button>
        </div>
        <Message etat={etat} />
      </div>
    </form>
  )
}

export function FormSuggestion() {
  const [etat, action, attente] = useActionState(proposerSuggestion, undefined)
  return (
    <form action={action} data-testid="form-suggestion" className="grid gap-3 sm:grid-cols-2">
      <label className={etiquette}>
        Suggestion
        <input id="sg-titre" name="titre" type="text" maxLength={100} className={champ} />
      </label>
      <label className={etiquette}>
        Auteur (facultatif)
        <input id="sg-auteur" name="auteur" type="text" maxLength={60} className={champ} />
      </label>
      <label className={etiquette + " sm:col-span-2"}>
        Détail (facultatif)
        <textarea id="sg-detail" name="detail" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <div>
          <Button type="submit" disabled={attente}>
            Proposer
          </Button>
        </div>
        <Message etat={etat} />
      </div>
    </form>
  )
}