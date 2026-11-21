import "server-only"

import { DEFINITIONS } from "@/lib/config-base"
import { dechiffrerConfig } from "@/lib/config-chiffrement"
import { db } from "@/lib/db"

export type SourceConfig = "ENV" | "BASE" | "AUCUNE"
export type EtatConfig = { valeurs: Record<string, string>; sources: Record<string, SourceConfig> }

// Priorite : variable d'environnement non vide, sinon valeur chiffree en base. Cache court, vide a chaque enregistrement.
const DUREE_CACHE = 10_000
// Le cache vit sur globalThis : les actions serveur et les routes d'API sont compilees dans des paquets separes
// du meme processus, une simple variable de module serait donc propre a chacun et resterait perimee.
type Cache = { t: number; etat: EtatConfig } | null
const partage = globalThis as unknown as { __miamConfigCache?: Cache }

export function invaliderConfig(): void {
  partage.__miamConfigCache = null
}

async function charger(): Promise<EtatConfig> {
  const base = new Map<string, string>()
  try {
    const lignes = await db.configuration.findMany()
    for (const l of lignes) {
      const v = dechiffrerConfig(l.cle, l.valeur)
      if (v !== null) base.set(l.cle, v)
    }
  } catch (e) {
    console.error("Lecture de la configuration impossible", e)
  }
  const valeurs: Record<string, string> = {}
  const sources: Record<string, SourceConfig> = {}
  for (const d of DEFINITIONS) {
    const env = (process.env[d.cle] ?? "").trim()
    if (env) {
      valeurs[d.cle] = env
      sources[d.cle] = "ENV"
    } else if (base.has(d.cle)) {
      valeurs[d.cle] = base.get(d.cle) as string
      sources[d.cle] = "BASE"
    } else {
      valeurs[d.cle] = ""
      sources[d.cle] = "AUCUNE"
    }
  }
  return { valeurs, sources }
}

export async function etatConfig(): Promise<EtatConfig> {
  const c = partage.__miamConfigCache
  if (c && Date.now() - c.t < DUREE_CACHE) return c.etat
  const etat = await charger()
  partage.__miamConfigCache = { t: Date.now(), etat }
  return etat
}

export const configuration = async (): Promise<Record<string, string>> => (await etatConfig()).valeurs
export const valeurConfig = async (cle: string): Promise<string> => (await etatConfig()).valeurs[cle] ?? ""