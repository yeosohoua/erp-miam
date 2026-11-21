"use client"

import { useActionState, useEffect, useRef, useState } from "react"


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCameraQr } from "@/components/use-camera-qr"
import type { Instantane, RapportSync } from "@/lib/hors-ligne"
import type { ResultatScan } from "@/lib/service"

import { useHorsLigne } from "./use-hors-ligne"

type Action = (etat: ResultatScan, fd: FormData) => Promise<ResultatScan>
type Props = {
  action: Action
  service: string
  etabId: string
  userId: string
  preparer: (service: string) => Promise<Instantane | { erreur: string }>
  synchroniser: (json: string) => Promise<RapportSync>
}

const STYLES: Record<string, string> = {
  SERVI: "border-green-600 bg-green-50 text-green-950 dark:bg-green-950/40 dark:text-green-50",
  DEJA: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  SANS_RESERVATION: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  SOLDE_INSUFFISANT: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  INCONNU: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50",
  INACTIF: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50",
  FERME: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50",
  ERREUR: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50",
}
const TITRES: Record<string, string> = {
  SERVI: "SERVI",
  DEJA: "DÉJÀ SERVI",
  SANS_RESERVATION: "PAS DE RÉSERVATION",
  SOLDE_INSUFFISANT: "SOLDE INSUFFISANT",
  INCONNU: "INCONNU",
  INACTIF: "NON ACTIF",
  FERME: "SERVICE FERMÉ",
  ERREUR: "ERREUR",
}

const heureFr = (t: number): string => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(new Date(t))

export function ScanClient({ action, service, etabId, userId, preparer, synchroniser }: Props) {
  const hl = useHorsLigne({ service, etabId, userId, preparer, synchroniser })
  const { scannerLocal, enLigneRef } = hl

  // En ligne : le serveur decide. Hors-ligne, ou si l'appel echoue : la liste preparee sur l'appareil decide.
  const actionSure = async (precedent: ResultatScan, fd: FormData): Promise<ResultatScan> => {
    if (enLigneRef.current) {
      try {
        return await action(precedent, fd)
      } catch {
        enLigneRef.current = false
      }
    }
    return scannerLocal(fd)
  }

  const [etat, formAction, enCours] = useActionState<ResultatScan, FormData>(actionSure, undefined)
  const [camera, setCamera] = useState(false)
  const [erreurCamera, setErreurCamera] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const champRef = useRef<HTMLInputElement>(null)
  

  // Apres chaque scan, le champ reprend le focus pour enchainer avec un lecteur USB.
  useEffect(() => {
    champRef.current?.focus()
  }, [etat])

  const { videoRef, erreur: erreurCam } = useCameraQr(camera, (valeur) => {
    if (champRef.current) champRef.current.value = valeur
    formRef.current?.requestSubmit()
  })
  useEffect(() => {
    if (erreurCam) {
      setErreurCamera(erreurCam)
      setCamera(false)
    }
  }, [erreurCam])

  const rapport = hl.rapport
  const ok = rapport ? rapport.filter((i) => i.issue === "OK").length : 0
  const doublons = rapport ? rapport.filter((i) => i.issue === "DOUBLON").length : 0
  const rejets = rapport ? rapport.filter((i) => i.issue === "REJET").length : 0

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col gap-3 rounded-lg border p-4"
        data-testid="etat-reseau"
        data-en-ligne={hl.enLigne ? "1" : "0"}
        data-attente={hl.attente}
        data-pret={hl.pret ? "1" : "0"}
        data-effectif={hl.pret?.effectif ?? 0}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={"font-medium " + (hl.enLigne ? "text-emerald-600" : "text-destructive")}>
            ● {hl.enLigne ? "En ligne" : "Hors-ligne : les passages sont gardés sur cet appareil"}
          </span>
          <span data-testid="attente-sync">{hl.attente > 0 ? hl.attente + " passage(s) à synchroniser" : "Rien à synchroniser"}</span>
          <span className="text-muted-foreground">
            {hl.pret ? "Liste hors-ligne prête : " + hl.pret.effectif + " repas réservés (préparée à " + heureFr(hl.pret.genereLe) + ")" : "Aucune liste hors-ligne préparée pour ce service"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void hl.preparerListe()} disabled={hl.occupe || !hl.enLigne}>
            Préparer le hors-ligne
          </Button>
          {hl.attente > 0 ? (
            <Button type="button" variant="outline" onClick={() => void hl.synchroniser()} disabled={hl.occupe || !hl.enLigne}>
              Synchroniser maintenant
            </Button>
          ) : null}
          {hl.pret || hl.attente === 0 ? (
            <Button type="button" variant="ghost" onClick={() => void hl.effacer()} disabled={hl.occupe || hl.attente > 0}>
              Effacer les données hors-ligne
            </Button>
          ) : null}
        </div>
        {hl.message ? (
          <p className="text-sm" data-testid="message-hors-ligne">
            {hl.message}
          </p>
        ) : null}
        {rapport ? (
          <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-sm" data-testid="rapport-sync" data-ok={ok} data-doublons={doublons} data-rejets={rejets}>
            <p className="font-medium">
              Synchronisation : {ok} enregistré(s), {doublons} doublon(s), {rejets} rejeté(s)
            </p>
            <ul className="list-disc pl-5">
              {rapport
                .filter((i) => i.issue !== "OK")
                .map((i) => (
                  <li key={i.id} data-issue={i.issue}>
                    {i.nom} : {i.message}
                  </li>
                ))}
            </ul>
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={hl.fermerRapport}>
                Fermer le rapport
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3" data-testid="form-scan">
        <div className="flex min-w-72 flex-1 flex-col gap-2">
          <Label htmlFor="scan-code">Badge ou matricule</Label>
          <Input id="scan-code" ref={champRef} name="code" autoComplete="off" autoFocus disabled={enCours} className="h-12 text-lg" />
        </div>
        <Button type="submit" size="lg" disabled={enCours}>
          Valider
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => { setErreurCamera(""); setCamera((c) => !c) }}>
          {camera ? "Arrêter la caméra" : "Activer la caméra"}
        </Button>
      </form>
      {erreurCamera ? <p className="text-sm text-destructive">{erreurCamera}</p> : null}
      {camera ? <video ref={videoRef} muted playsInline className="max-h-72 w-full max-w-md rounded-lg border bg-black" /> : null}

      {etat ? (
        <div
          key={etat.at}
          role="status"
          aria-live="polite"
          data-testid="resultat-scan"
          data-statut={etat.statut}
          data-code={etat.inscrit?.matricule ?? ""}
          data-hors-ligne={etat.horsLigne ? "1" : "0"}
          className={"rounded-xl border-4 p-6 " + STYLES[etat.statut]}
        >
          <p className="text-4xl font-extrabold tracking-tight">{TITRES[etat.statut]}</p>
          <p className="mt-1 text-lg">{etat.message}</p>
          {etat.horsLigne && etat.statut === "SERVI" ? <p className="mt-1 text-sm font-medium">Enregistré sur cet appareil : synchronisation à la reconnexion.</p> : null}
          {etat.paiement ? (
            <p className="mt-1 text-base font-medium" data-testid="paiement-scan">
              {etat.paiement}
            </p>
          ) : null}
          {etat.inscrit ? (
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-2xl font-semibold">{etat.inscrit.nom}</p>
              <p className="text-sm opacity-80">
                {etat.inscrit.matricule}
                {etat.inscrit.groupe ? " · " + etat.inscrit.groupe : ""}
                {etat.inscrit.regime ? " · Régime " + etat.inscrit.regime : ""}
              </p>
              {etat.inscrit.allergies.length > 0 ? (
                <p className="mt-2 text-xl font-bold text-red-700 dark:text-red-300" data-testid="alerte-allergies">
                  ⚠ Allergies : {etat.inscrit.allergies.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {(etat.statut === "SANS_RESERVATION" || etat.statut === "SOLDE_INSUFFISANT") && etat.inscrit ? (
            <form action={formAction} className="mt-4">
              <input type="hidden" name="forcer" value="1" />
              <input type="hidden" name="inscritId" value={etat.inscrit.id} />
              <input type="hidden" name="code" value={etat.inscrit.matricule} />
              <Button type="submit" size="lg" disabled={enCours}>
                {etat.statut === "SOLDE_INSUFFISANT" ? "Servir quand même (solde négatif)" : "Servir quand même (exception)"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}