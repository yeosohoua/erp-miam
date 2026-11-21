"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  ajouterPassage,
  decider,
  ecrireInstantane,
  jourLocal,
  lireInstantane,
  listerInstantanes,
  listerPassages,
  prechauffer,
  supprimerInstantane,
  supprimerInstantanes,
  supprimerPassage,
  viderCache,
  type Instantane,
  type IssueSync,
  type RapportSync,
} from "@/lib/hors-ligne"
import type { ResultatScan } from "@/lib/service"

type Preparer = (service: string) => Promise<Instantane | { erreur: string }>
type Synchroniser = (json: string) => Promise<RapportSync>
export type EtatPret = { effectif: number; servis: number; genereLe: number } | null

export function useHorsLigne(o: { service: string; etabId: string; userId: string; preparer: Preparer; synchroniser: Synchroniser }) {
  const { service, etabId, userId, preparer, synchroniser: synchroniserAction } = o
  const router = useRouter()
  const [enLigne, setEnLigne] = useState(true)
  const [attente, setAttente] = useState(0)
  const [pret, setPret] = useState<EtatPret>(null)
  const [rapport, setRapport] = useState<IssueSync[] | null>(null)
  const [message, setMessage] = useState("")
  const [occupe, setOccupe] = useState(false)
  const enLigneRef = useRef(true)
  const occupeRef = useRef(false)
  const synchroRef = useRef<() => Promise<void>>(async () => {})

  const changer = useCallback((v: boolean) => {
    enLigneRef.current = v
    setEnLigne(v)
  }, [])

  const valide = useCallback((s: Instantane) => s.etabId === etabId && s.userId === userId && s.jour === jourLocal(), [etabId, userId])

  const rafraichir = useCallback(async () => {
    try {
      const passages = (await listerPassages()).filter((p) => p.etabId === etabId)
      setAttente(passages.length)
      const s = await lireInstantane(service)
      setPret(s && valide(s) ? { effectif: s.items.length, servis: s.items.filter((i) => i.servi).length, genereLe: s.genereLe } : null)
    } catch {
      // stockage local indisponible : le mode hors-ligne reste inactif
    }
  }, [etabId, service, valide])

  const synchroniser = useCallback(async () => {
    if (occupeRef.current) return
    occupeRef.current = true
    setOccupe(true)
    try {
      const tous = (await listerPassages()).filter((p) => p.etabId === etabId).slice(0, 200)
      if (tous.length === 0) return
      const rapportServeur = await synchroniserAction(
        JSON.stringify(tous.map((p) => ({ id: p.id, code: p.code, service: p.service, jour: p.jour, forcer: p.forcer, at: p.at }))),
      )
      if ("erreur" in rapportServeur) {
        setMessage(rapportServeur.erreur)
        return
      }
      const traites = new Set(rapportServeur.issues.map((i) => i.id))
      for (const p of tous) if (traites.has(p.id)) await supprimerPassage(p.id)
      if (rapportServeur.issues.length > 0) setRapport(rapportServeur.issues)
      setMessage("")
      router.refresh()
    } catch {
      setMessage("Synchronisation impossible pour le moment : nouvel essai automatique.")
    } finally {
      occupeRef.current = false
      setOccupe(false)
      await rafraichir()
    }
  }, [etabId, synchroniserAction, router, rafraichir])

  useEffect(() => {
    synchroRef.current = synchroniser
  }, [synchroniser])

  useEffect(() => {
    let actif = true
    void (async () => {
      try {
        for (const s of await listerInstantanes()) if (!valide(s)) await supprimerInstantane(s.service)
      } catch {
        // rien a purger
      }
      if (actif) await rafraichir()
    })()
    return () => {
      actif = false
    }
  }, [valide, rafraichir])

  useEffect(() => {
    let actif = true
    const sonder = async () => {
      let ok = false
      try {
        const r = await fetch("/api/sante", { cache: "no-store", signal: AbortSignal.timeout(3000) })
        ok = r.ok
      } catch {
        ok = false
      }
      if (!actif) return
      changer(ok)
      if (ok) void synchroRef.current()
    }
    if (!navigator.onLine) changer(false)
    void sonder()
    const minuteur = setInterval(sonder, 8000)
    const hors = () => changer(false)
    const retour = () => void sonder()
    window.addEventListener("offline", hors)
    window.addEventListener("online", retour)
    return () => {
      actif = false
      clearInterval(minuteur)
      window.removeEventListener("offline", hors)
      window.removeEventListener("online", retour)
    }
  }, [changer])

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw-service.js").catch(() => {})
  }, [])

  const scannerLocal = useCallback(
    async (fd: FormData): Promise<ResultatScan> => {
      const at = Date.now()
      const code = String(fd.get("code") ?? "").trim()
      const forcer = fd.get("forcer") === "1"
      if (!forcer && !code) return { at, statut: "ERREUR", message: "Scannez un badge ou saisissez un matricule." }
      try {
        const s = await lireInstantane(service)
        if (!s || !valide(s)) {
          return { at, statut: "ERREUR", message: "Hors-ligne : aucune liste préparée pour ce service. Reconnectez-vous puis appuyez sur « Préparer le hors-ligne ».", horsLigne: true }
        }
        const d = decider(s, code, forcer, at)
        if (d.passage) {
          await ajouterPassage(d.passage)
          await ecrireInstantane(d.snap)
        }
        await rafraichir()
        return d.resultat
      } catch {
        return { at, statut: "ERREUR", message: "Stockage hors-ligne indisponible sur cet appareil.", horsLigne: true }
      }
    },
    [service, valide, rafraichir],
  )

  const preparerListe = useCallback(async () => {
    if (!enLigneRef.current) {
      setMessage("Une connexion est nécessaire pour préparer la liste.")
      return
    }
    const attendus = (await listerPassages()).filter((p) => p.etabId === etabId)
    if (attendus.length > 0) {
      setMessage("Synchronisez d'abord les passages en attente.")
      return
    }
    setOccupe(true)
    try {
      const r = await preparer(service)
      if ("erreur" in r) {
        setMessage(r.erreur)
        return
      }
      await ecrireInstantane(r)
      await prechauffer().catch(() => {})
      setRapport(null)
      setMessage("Liste prête : " + r.items.length + " repas réservés.")
    } catch {
      setMessage("Préparation impossible pour le moment.")
    } finally {
      setOccupe(false)
      await rafraichir()
    }
  }, [etabId, service, preparer, rafraichir])

  const effacer = useCallback(async () => {
    const attendus = (await listerPassages()).filter((p) => p.etabId === etabId)
    if (attendus.length > 0) {
      setMessage("Des passages attendent leur synchronisation : ils ne peuvent pas être effacés.")
      return
    }
    await supprimerInstantanes()
    await viderCache()
    setRapport(null)
    setMessage("Données hors-ligne effacées de cet appareil.")
    await rafraichir()
  }, [etabId, rafraichir])

  return { enLigne, attente, pret, rapport, message, occupe, scannerLocal, preparerListe, effacer, synchroniser, fermerRapport: () => setRapport(null), enLigneRef }
}