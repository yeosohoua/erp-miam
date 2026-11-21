import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const cle = (): Buffer => createHash("sha256").update("miam-2fa:" + (process.env.SESSION_SECRET ?? "")).digest()

export function chiffrer(texte: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", cle(), iv)
  const donnees = Buffer.concat([c.update(texte, "utf8"), c.final()])
  return [iv, c.getAuthTag(), donnees].map((b) => b.toString("base64url")).join(".")
}

export function dechiffrer(valeur: string): string | null {
  try {
    const [iv, tag, donnees] = valeur.split(".").map((p) => Buffer.from(p, "base64url"))
    const d = createDecipheriv("aes-256-gcm", cle(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(donnees), d.final()]).toString("utf8")
  } catch {
    return null
  }
}