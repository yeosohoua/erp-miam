import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// Cle derivee de SESSION_SECRET avec un contexte propre a la configuration (differente de celle du 2FA).
// Le nom du reglage est lie au chiffre : une valeur copiee vers un autre reglage ne se dechiffre pas.
const cle = (): Buffer => createHash("sha256").update("miam-config:" + (process.env.SESSION_SECRET ?? "")).digest()

export function chiffrerConfig(nom: string, texte: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", cle(), iv)
  c.setAAD(Buffer.from(nom, "utf8"))
  const donnees = Buffer.concat([c.update(texte, "utf8"), c.final()])
  return [iv, c.getAuthTag(), donnees].map((b) => b.toString("base64url")).join(".")
}

export function dechiffrerConfig(nom: string, valeur: string): string | null {
  try {
    const [iv, tag, donnees] = valeur.split(".").map((p) => Buffer.from(p, "base64url"))
    const d = createDecipheriv("aes-256-gcm", cle(), iv)
    d.setAAD(Buffer.from(nom, "utf8"))
    d.setAuthTag(tag)
    return Buffer.concat([d.update(donnees), d.final()]).toString("utf8")
  } catch {
    return null
  }
}