import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const MOTIF = /^miam_([0-9a-f]{8})_([0-9a-f]{32})$/

export const hacher = (cle: string): string => createHash("sha256").update(cle).digest("hex")

// La cle complete n'est connue qu'a la creation ; seuls le prefixe et l'empreinte sont conserves.
export function creerCle(): { cle: string; prefixe: string; hash: string } {
  const prefixe = randomBytes(4).toString("hex")
  const cle = "miam_" + prefixe + "_" + randomBytes(16).toString("hex")
  return { cle, prefixe, hash: hacher(cle) }
}

export function analyserCle(cle: string): { prefixe: string } | null {
  const m = MOTIF.exec(cle)
  return m ? { prefixe: m[1] } : null
}

export function verifierCle(cle: string, hashStocke: string): boolean {
  const a = Buffer.from(hacher(cle), "hex")
  const b = Buffer.from(hashStocke, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}