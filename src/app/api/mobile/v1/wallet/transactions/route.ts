import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { choisirFiche } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"

function libelle(t: { type: string; methode: string | null; note: string | null }): string {
  if (t.type === "TOPUP") {
    if (t.note === "Carte cadeau") return "Carte cadeau"
    if (t.methode === "PAYSTACK") return "Recharge Paystack"
    if (t.methode === "CASH") return "Recharge en caisse"
    return t.methode ? "Recharge " + t.methode : "Recharge"
  }
  if (t.type === "DEBIT") return t.note && t.note.trim() !== "" ? t.note : "Achat à la cantine"
  if (t.type === "REFUND") return "Remboursement"
  return "Ajustement"
}

// Historique des mouvements du compte (100 derniers). Montant signe : positif = credit, negatif = debit.
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  if (a.role === "EMPLOYE") return json({ transactions: [] })
  const f = await choisirFiche(a, new URL(req.url).searchParams.get("inscritId"))
  if (f instanceof Response) return f
  const liste = await db.transaction.findMany({
    where: { inscritId: f.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, methode: true, montant: true, reference: true, note: true, createdAt: true },
  })
  return json({
    inscritId: f.id,
    devise: f.etab.currency,
    transactions: liste.map((t) => {
      const type = String(t.type)
      const montant = type === "DEBIT" ? -Math.abs(t.montant) : type === "TOPUP" || type === "REFUND" ? Math.abs(t.montant) : t.montant
      return { id: t.id, type, libelle: libelle({ type, methode: t.methode ? String(t.methode) : null, note: t.note }), montant, reference: t.reference, date: t.createdAt.toISOString() }
    }),
  })
}