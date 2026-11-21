import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let valeur = 0
  let sortie = ""
  for (const octet of buf) {
    valeur = (valeur << 8) | octet
    bits += 8
    while (bits >= 5) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31]
  return sortie
}

export function base32Decode(texte: string): Buffer {
  let bits = 0
  let valeur = 0
  const octets: number[] = []
  for (const c of texte.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(c)
    if (i < 0) throw new Error("Secret base32 invalide")
    valeur = (valeur << 5) | i
    bits += 5
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(octets)
}

export const genererSecret = (): string => base32Encode(randomBytes(20))

export function codeTotp(secret: string, pas: number): string {
  const compteur = Buffer.alloc(8)
  compteur.writeBigUInt64BE(BigInt(pas))
  const h = createHmac("sha1", base32Decode(secret)).update(compteur).digest()
  const o = h[h.length - 1] & 15
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000
  return String(n).padStart(6, "0")
}

export const pasCourant = (maintenant: number = Date.now()): number => Math.floor(maintenant / 1000 / 30)

const egal = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

// Renvoie le pas valide (fenetre +/-1) ou null. Un pas deja utilise (<= dernierPas) est refuse : pas de rejeu.
export function verifierTotp(secret: string, code: string, dernierPas: number | null, maintenant: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const c = pasCourant(maintenant)
  for (const d of [0, -1, 1]) {
    const pas = c + d
    if (dernierPas !== null && pas <= dernierPas) continue
    if (egal(codeTotp(secret, pas), code)) return pas
  }
  return null
}

export function uriOtpauth(secret: string, email: string, emetteur: string): string {
  const e = encodeURIComponent(emetteur)
  return "otpauth://totp/" + e + ":" + encodeURIComponent(email) + "?secret=" + secret + "&issuer=" + e + "&algorithm=SHA1&digits=6&period=30"
}

export function nouveauxCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const h = randomBytes(5).toString("hex").toUpperCase()
    return h.slice(0, 5) + "-" + h.slice(5)
  })
}

export const hacherCode = (code: string): string => createHash("sha256").update(code.replace(/[^0-9A-Za-z]/g, "").toUpperCase()).digest("hex")