// Caisse et vente au comptoir : fonctions pures, sans acces base de donnees.
export const MODES = { COMPTE: "Compte prépayé", CASH: "Espèces", ORANGE: "Orange Money", MTN: "MTN MoMo", WAVE: "Wave", MOOV: "Moov Money" } as const
export type ModeCaisse = keyof typeof MODES
export const ORDRE_MODES: ModeCaisse[] = ["COMPTE", "CASH", "ORANGE", "MTN", "WAVE", "MOOV"]
export const modeValide = (v: unknown): v is ModeCaisse => typeof v === "string" && Object.hasOwn(MODES, v)

export const QTE_MAX = 99
export const LIGNES_MAX = 30
export const TOTAL_MAX = 10_000_000
export const PRIX_ARTICLE_MAX = 1_000_000

export const numeroTicket = (n: number): string => "T-" + String(n).padStart(5, "0")

export type LignePanier = { articleId: string; quantite: number }

// Valide un panier venu du navigateur : seules les references et les quantites comptent, les prix sont toujours relus en base.
export function analyserPanier(brut: unknown): { lignes: LignePanier[] } | { erreur: string } {
  if (!Array.isArray(brut)) return { erreur: "Panier invalide." }
  if (brut.length === 0) return { erreur: "Le panier est vide." }
  if (brut.length > LIGNES_MAX) return { erreur: "Panier trop volumineux (" + LIGNES_MAX + " lignes au plus)." }
  const cumul = new Map<string, number>()
  for (const l of brut) {
    if (typeof l !== "object" || l === null) return { erreur: "Panier invalide." }
    const { articleId, quantite } = l as { articleId?: unknown; quantite?: unknown }
    if (typeof articleId !== "string" || articleId.length === 0 || articleId.length > 64) return { erreur: "Article invalide." }
    if (typeof quantite !== "number" || !Number.isInteger(quantite) || quantite < 1 || quantite > QTE_MAX) return { erreur: "Quantité invalide : un entier entre 1 et " + QTE_MAX + "." }
    const somme = (cumul.get(articleId) ?? 0) + quantite
    if (somme > QTE_MAX) return { erreur: "Quantité invalide : " + QTE_MAX + " au plus par article." }
    cumul.set(articleId, somme)
  }
  return { lignes: [...cumul.entries()].map(([articleId, quantite]) => ({ articleId, quantite })) }
}

export const totalPanier = (lignes: { prixUnitaire: number; quantite: number }[]): number => lignes.reduce((t, l) => t + l.prixUnitaire * l.quantite, 0)

export function parsePrix(v: string): number | null {
  const s = v.trim()
  if (!/^\d{1,7}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= PRIX_ARTICLE_MAX ? n : null
}
// ---- Sessions de caisse, rapports et monnaie (fonctions pures)
export const FOND_MAX = 10_000_000

export function parseMontantZero(v: string): number | null {
  const s = v.trim()
  if (!/^\d{1,9}$/.test(s)) return null
  const n = Number(s)
  return n <= 1_000_000_000 ? n : null
}

export const especesAttendues = (fond: number, ventesCash: number): number => fond + ventesCash
export const ecartCloture = (compte: number, attendu: number): number => compte - attendu
export const renduMonnaie = (recu: number, total: number): number => Math.max(0, recu - total)

export type Ventilation = { nbPayees: number; totalPayees: number; nbAnnulees: number; totalAnnulees: number; parMode: Record<string, { nb: number; total: number }> }

export function ventiler(ventes: { methode: string | null; statut: string; total: number; partCompte?: number }[]): Ventilation {
  const r: Ventilation = { nbPayees: 0, totalPayees: 0, nbAnnulees: 0, totalAnnulees: 0, parMode: {} }
  for (const v of ventes) {
    if (v.statut === "PAYEE") {
      r.nbPayees += 1
      r.totalPayees += v.total
      const mode = v.methode ?? "COMPTE"
      const p = r.parMode[mode] ?? { nb: 0, total: 0 }
      p.nb += 1
      p.total += v.total - (v.partCompte ?? 0)
      if (v.partCompte) {
        const pc = r.parMode["COMPTE"] ?? { nb: 0, total: 0 }
        pc.nb += 1
        pc.total += v.partCompte
        r.parMode["COMPTE"] = pc
      }
      r.parMode[mode] = p
    } else {
      r.nbAnnulees += 1
      r.totalAnnulees += v.total
    }
  }
  return r
}

export type LigneRapport = { caissier: string | null; methode: string | null; statut: string; nb: number; total: number }
export type RapportCaissier = { caissier: string; nb: number; total: number; annulees: number; montantAnnule: number; parMode: Record<string, { nb: number; total: number }> }

export function rapportParCaissier(lignes: LigneRapport[]): RapportCaissier[] {
  const m = new Map<string, RapportCaissier>()
  for (const l of lignes) {
    const cle = l.caissier ?? "—"
    const r = m.get(cle) ?? { caissier: cle, nb: 0, total: 0, annulees: 0, montantAnnule: 0, parMode: {} }
    if (l.statut === "PAYEE") {
      r.nb += l.nb
      r.total += l.total
      const mode = l.methode ?? "COMPTE"
      const p = r.parMode[mode] ?? { nb: 0, total: 0 }
      p.nb += l.nb
      p.total += l.total
      r.parMode[mode] = p
    } else {
      r.annulees += l.nb
      r.montantAnnule += l.total
    }
    m.set(cle, r)
  }
  return [...m.values()].sort((a, b) => a.caissier.localeCompare(b.caissier, "fr"))
}

const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/
function jourReel(s: string): number | null {
  if (!ISO_JOUR.test(s)) return null
  const t = Date.parse(s + "T00:00:00.000Z")
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 10) === s ? t : null
}

export function periodeValide(du: string, au: string): { du: string; au: string } | null {
  const a = jourReel(du)
  const b = jourReel(au)
  if (a === null || b === null || a > b || (b - a) / 864e5 > 366) return null
  return { du, au }
}
