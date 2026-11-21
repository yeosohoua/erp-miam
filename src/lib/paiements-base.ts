export const METHODES = { CASH: "Espèces", ORANGE: "Orange Money", MTN: "MTN MoMo", WAVE: "Wave", MOOV: "Moov Money", PAYSTACK: "Paystack (en ligne)" } as const
export type MethodePaiement = keyof typeof METHODES
export const ORDRE_METHODES: readonly MethodePaiement[] = ["CASH", "ORANGE", "MTN", "WAVE", "MOOV"]
export const methodeValide = (v: string): v is MethodePaiement => (ORDRE_METHODES as readonly string[]).includes(v)

export const TYPES_OPERATION = { TOPUP: "Recharge", DEBIT: "Repas", REFUND: "Remboursement", ADJUST: "Ajustement" } as const

export const MONTANT_MAX = 10_000_000
export const PRIX_MAX = 1_000_000

// Montant entier (espaces tolerés). `signe` autorise un montant négatif (ajustements).
export function parseMontant(v: string, signe = false): number | null {
  const s = v.replace(/[\s\u00a0\u202f]/g, "")
  if (!(signe ? /^-?\d{1,9}$/ : /^\d{1,9}$/).test(s)) return null
  const n = Number(s)
  return Math.abs(n) > MONTANT_MAX ? null : n
}