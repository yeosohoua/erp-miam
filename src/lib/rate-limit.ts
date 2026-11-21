import "server-only"

import { redis } from "@/lib/redis"

// Blocage anti force brute stocke dans Redis : il survit aux redemarrages et sert plusieurs instances.
// Si Redis est indisponible, la connexion reste possible (l'erreur est journalisee) plutot que de bloquer tout le monde.
const FENETRE_SECONDES = 15 * 60
const MAX_ECHECS = 5

const cleEchecs = (cle: string) => "rl:fail:" + cle
const cleBlocage = (cle: string) => "rl:blk:" + cle

export function cleLimite(email: string): string {
  return email.trim().toLowerCase()
}

export async function secondesAvantReessai(cle: string): Promise<number> {
  try {
    const ttl = await redis().ttl(cleBlocage(cle))
    return ttl > 0 ? ttl : 0
  } catch (e) {
    console.error("Limite de connexion : Redis indisponible", e)
    return 0
  }
}

export async function enregistrerEchec(cle: string, max: number = MAX_ECHECS): Promise<void> {
  try {
    const r = redis()
    const n = await r.incr(cleEchecs(cle))
    if (n === 1) await r.expire(cleEchecs(cle), FENETRE_SECONDES)
    if (n >= max) await r.set(cleBlocage(cle), "1", "EX", FENETRE_SECONDES)
  } catch (e) {
    console.error("Limite de connexion : Redis indisponible", e)
  }
}

export async function effacerEchecs(cle: string): Promise<void> {
  try {
    await redis().del(cleEchecs(cle), cleBlocage(cle))
  } catch (e) {
    console.error("Limite de connexion : Redis indisponible", e)
  }
}