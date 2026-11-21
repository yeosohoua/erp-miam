export const CANAUX = { SMS: "SMS", WHATSAPP: "WhatsApp", EMAIL: "E-mail" } as const
export type Canal = keyof typeof CANAUX
export const ORDRE_CANAUX: readonly Canal[] = ["SMS", "WHATSAPP", "EMAIL"]
export const canalValide = (v: string): v is Canal => Object.hasOwn(CANAUX, v)

export const EVENEMENTS = {
  RELANCE: "Relance de facture",
  RECHARGE: "Recharge reçue",
  SOLDE_BAS: "Solde bas",
  REPAS_SERVI: "Repas servi",
  STOCK: "Alerte stock",
  TEST: "Message de test",
} as const

export const STATUTS_NOTIFICATION = { PENDING: "En attente", SENT: "Envoyé", FAILED: "Échec", SKIPPED: "Non envoyé" } as const
export type StatutNotification = keyof typeof STATUTS_NOTIFICATION

export const TENTATIVES_MAX = 3
export const SEUIL_SOLDE_MAX = 1_000_000

export type Reglages = {
  sms: boolean
  whatsapp: boolean
  email: boolean
  relances: boolean
  recharges: boolean
  soldeBas: boolean
  seuilSoldeBas: number
  repasServi: boolean
  alertesStock: boolean
}
export const REGLAGES_DEFAUT: Reglages = { sms: false, whatsapp: false, email: true, relances: true, recharges: true, soldeBas: true, seuilSoldeBas: 1000, repasServi: false, alertesStock: true }

export const emailNotifValide = (v: string): boolean => v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// Numero ivoirien a 10 chiffres (07 07 07 07 07) ou numero international (+33..., 0033...). Retourne +chiffres ou null.
export function normaliserTelephone(v: string): string | null {
  const brut = v.trim()
  if (!/^[+\d\s().-]+$/.test(brut)) return null
  const chiffres = brut.replace(/\D/g, "")
  if (brut.startsWith("+")) return chiffres.length >= 8 && chiffres.length <= 15 ? "+" + chiffres : null
  if (chiffres.startsWith("00")) {
    const d = chiffres.slice(2)
    return d.length >= 8 && d.length <= 15 ? "+" + d : null
  }
  if (chiffres.length === 10) return "+225" + chiffres
  if (chiffres.length === 13 && chiffres.startsWith("225")) return "+" + chiffres
  return null
}

// Espaces insecables remplaces : un SMS reste en alphabet standard.
export const texteSimple = (s: string): string => s.replace(/[\u00a0\u202f]/g, " ").replace(/[ \t]+\n/g, "\n").trim()