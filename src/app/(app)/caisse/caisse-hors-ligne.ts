"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import type { RetourSyncVentes } from "@/lib/caisse-hors-ligne-base"

export type VenteLocale = {
  cle: string
  at: number
  libelle: string
  mode: string
  visiteur: string
  recu: number | null
  pct: number
  total: number
  lignes: { articleId: string; nom: string; quantite: number; prix: number }[]
}
export type VenteRejetee = { cle: string; libelle: string; erreur: string }

const FILE_MAX = 100

// Identifiant unique d'une vente (crypto.randomUUID n'existe pas en HTTP simple sur un reseau local).
export function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)
}

function lire<T>(cle: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(cle) ?? "[]")
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}
function ecrire(cle: string, valeur: unknown): boolean {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
    return true
  } catch {
    return false
  }
}

// File locale des ventes hors ligne (especes / Mobile Money), propre a l'etablissement et au caissier.
export function useCaisseHorsLigne(o: { etabId: string; userId: string; synchroniser: (json: string) => Promise<RetourSyncVentes> }) {
  const { etabId, userId, synchroniser: synchroAction } = o
  const router = useRouter()
  const kFile = "miam-caisse-hl:" + etabId + ":" + userId
  const kRej = kFile + ":rej"
  const kNum = kFile + ":n"
  const [enLigne, setEnLigne] = useState(true)
  const [attente, setAttente] = useState(0)
  const [rejets, setRejets] = useState<VenteRejetee[]>([])
  const [occupe, setOccupe] = useState(false)
  const occupeRef = useRef(false)
  const synchroRef = useRef<() => Promise<void>>(async () => {})

  const rafraichir = useCallback(() => {
    setAttente(lire<VenteLocale>(kFile).length)
    setRejets(lire<VenteRejetee>(kRej))
  }, [kFile, kRej])

  const synchroniser = useCallback(async () => {
    if (occupeRef.current) return
    const file = lire<VenteLocale>(kFile)
    if (file.length === 0) return
    occupeRef.current = true
    setOccupe(true)
    try {
      const envoi = file.slice(0, FILE_MAX).map((v) => ({ cle: v.cle, at: v.at, mode: v.mode, visiteur: v.visiteur, recu: v.recu, pct: v.pct, lignes: v.lignes.map((l) => ({ articleId: l.articleId, quantite: l.quantite, prix: l.prix })) }))
      const r = await synchroAction(JSON.stringify(envoi))
      if ("erreur" in r) return
      const traitees = new Map(r.issues.map((i) => [i.cle, i]))
      const restantes: VenteLocale[] = []
      const rej = lire<VenteRejetee>(kRej)
      for (const v of lire<VenteLocale>(kFile)) {
        const i = traitees.get(v.cle)
        if (!i) restantes.push(v)
        else if (i.ok) continue
        else if (i.reessayer) restantes.push(v)
        else rej.push({ cle: v.cle, libelle: v.libelle, erreur: i.erreur ?? "Refusée." })
      }
      ecrire(kFile, restantes)
      ecrire(kRej, rej)
      router.refresh()
    } catch {
      // reseau indisponible : nouvel essai automatique au prochain passage
    } finally {
      occupeRef.current = false
      setOccupe(false)
      rafraichir()
    }
  }, [kFile, kRej, synchroAction, router, rafraichir])

  useEffect(() => {
    synchroRef.current = synchroniser
  }, [synchroniser])

  useEffect(() => {
    let actif = true
    rafraichir()
    const sonder = async () => {
      let ok = false
      try {
        const r = await fetch("/api/sante", { cache: "no-store", signal: AbortSignal.timeout(3000) })
        ok = r.ok
      } catch {
        ok = false
      }
      if (!actif) return
      setEnLigne(ok)
      rafraichir()
      if (ok) void synchroRef.current()
    }
    if (!navigator.onLine) setEnLigne(false)
    void sonder()
    const minuteur = setInterval(sonder, 8000)
    const hors = () => setEnLigne(false)
    const retour = () => void sonder()
    window.addEventListener("offline", hors)
    window.addEventListener("online", retour)
    return () => {
      actif = false
      clearInterval(minuteur)
      window.removeEventListener("offline", hors)
      window.removeEventListener("online", retour)
    }
  }, [rafraichir])

  // Ajoute une vente a la file : renvoie son numero provisoire (HL-001...) ou null si l'appareil ne peut pas la garder.
  const ajouter = useCallback(
    (v: Omit<VenteLocale, "libelle">): string | null => {
      const file = lire<VenteLocale>(kFile)
      if (file.length >= FILE_MAX) return null
      let n = 0
      try {
        n = Number(localStorage.getItem(kNum)) || 0
      } catch {
        n = 0
      }
      n += 1
      const libelle = "HL-" + String(n).padStart(3, "0")
      if (!ecrire(kFile, [...file, { ...v, libelle }])) return null
      try {
        localStorage.setItem(kNum, String(n))
      } catch {
        // compteur d'affichage seulement
      }
      rafraichir()
      return libelle
    },
    [kFile, kNum, rafraichir],
  )

  const ecarter = useCallback(
    (cle: string) => {
      ecrire(kRej, lire<VenteRejetee>(kRej).filter((r) => r.cle !== cle))
      rafraichir()
    },
    [kRej, rafraichir],
  )

  return { enLigne, attente, rejets, occupe, ajouter, ecarter, synchroniser }
}