"use client"

import { useActionState, useEffect, useState } from "react"

import { Messages, classeSelect } from "@/components/form-messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EtatAction } from "@/lib/etat-action"
import { STATUTS_INSCRIT, TYPES_INSCRIT } from "@/lib/inscrits"

type Ref = { id: string; name: string }
export type InscritValeurs = { matricule: string; prenom: string; nom: string; type: string; statut: string; groupeId: string; regimeId: string; allergies: string[] }
const VIDE: InscritValeurs = { matricule: "", prenom: "", nom: "", type: "STUDENT", statut: "ACTIVE", groupeId: "", regimeId: "", allergies: [] }

export function InscritForm({
  mode,
  action,
  groupes,
  regimes,
  allergies,
  valeurs,
}: {
  mode: "creation" | "edition"
  action: (etat: EtatAction, fd: FormData) => Promise<EtatAction>
  groupes: Ref[]
  regimes: Ref[]
  allergies: Ref[]
  valeurs?: InscritValeurs
}) {
  const [etat, formAction, enCours] = useActionState<EtatAction, FormData>(action, undefined)
  const [v, setV] = useState<InscritValeurs>(valeurs ?? VIDE)
  const champ = (cle: keyof InscritValeurs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [cle]: e.target.value }))
  const basculer = (id: string) => setV((p) => ({ ...p, allergies: p.allergies.includes(id) ? p.allergies.filter((a) => a !== id) : [...p.allergies, id] }))

  useEffect(() => {
    if (mode === "creation" && etat?.ok) setV(VIDE)
  }, [etat, mode])

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2" data-testid={mode === "creation" ? "form-inscrit" : "form-inscrit-edition"}>
      {mode === "creation" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="ins-matricule">Matricule</Label>
          <Input id="ins-matricule" name="matricule" autoComplete="off" maxLength={20} placeholder="Vide : généré (ex. 26GSL0001)" value={v.matricule} onChange={champ("matricule")} disabled={enCours} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Matricule</Label>
          <p className="flex h-9 items-center font-mono text-sm text-muted-foreground">{v.matricule}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="ins-type">Type</Label>
        <select id="ins-type" name="type" value={v.type} onChange={champ("type")} disabled={enCours} className={classeSelect}>
          {Object.entries(TYPES_INSCRIT).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ins-prenom">Prénom</Label>
        <Input id="ins-prenom" name="prenom" autoComplete="off" value={v.prenom} onChange={champ("prenom")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ins-nom">Nom</Label>
        <Input id="ins-nom" name="nom" autoComplete="off" value={v.nom} onChange={champ("nom")} disabled={enCours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ins-groupe">Groupe</Label>
        <select id="ins-groupe" name="groupe" value={v.groupeId} onChange={champ("groupeId")} disabled={enCours} className={classeSelect}>
          <option value="">— Aucun —</option>
          {groupes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ins-regime">Régime</Label>
        <select id="ins-regime" name="regime" value={v.regimeId} onChange={champ("regimeId")} disabled={enCours} className={classeSelect}>
          <option value="">— Aucun —</option>
          {regimes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      {mode === "edition" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="ins-statut">Statut</Label>
          <select id="ins-statut" name="statut" value={v.statut} onChange={champ("statut")} disabled={enCours} className={classeSelect}>
            {Object.entries(STATUTS_INSCRIT).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-2 md:col-span-2">
        <legend className="text-sm font-medium">Allergies</legend>
        {allergies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune allergie dans le référentiel.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {allergies.map((a) => (
              <label key={a.id} htmlFor={"ins-all-" + a.id} className="flex items-center gap-2 text-sm">
                <input id={"ins-all-" + a.id} name="allergies" type="checkbox" value={a.id} checked={v.allergies.includes(a.id)} onChange={() => basculer(a.id)} disabled={enCours} />
                {a.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : mode === "creation" ? "Créer l'inscrit" : "Enregistrer"}
        </Button>
        <Messages etat={etat} />
      </div>
    </form>
  )
}