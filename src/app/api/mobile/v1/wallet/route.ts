import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { fichesAccessibles } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"
import { RECHARGE_MAX, RECHARGE_MIN, paystackConfigure } from "@/lib/paystack"

// Portefeuille de la personne connectee : un compte (solde + QR) par inscrit accessible.
// Eleve : son badge. Parent : le badge de chaque enfant. Employe : "EMP:<matricule>" (pas de solde prepaye).
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const base = { role: a.role, nom: a.name, rechargeActive: await paystackConfigure(), min: RECHARGE_MIN, max: RECHARGE_MAX }
  if (a.role === "PARENT" || a.role === "ELEVE") {
    const fiches = await fichesAccessibles(a)
    const badges = await db.inscrit.findMany({ where: { id: { in: fiches.map((f) => f.id) } }, select: { id: true, badge: true } })
    const parId = new Map(badges.map((b) => [b.id, b.badge]))
    const comptes = fiches.map((f) => ({
      inscritId: f.id,
      nom: f.nom,
      matricule: f.matricule,
      qr: parId.get(f.id) ?? "",
      solde: f.solde,
      devise: f.etab.currency,
      etablissement: f.etab.name,
      prepaye: f.etab.prepaye,
    }))
    return json({ ...base, qr: comptes[0]?.qr ?? "", comptes })
  }
  if (a.role === "EMPLOYE") {
    const c = await db.codeAcces.findUnique({ where: { userId: a.userId }, select: { employe: { select: { matricule: true } } } })
    return json({ ...base, qr: c?.employe ? "EMP:" + c.employe.matricule : "", comptes: [] })
  }
  return json({ ...base, qr: "", comptes: [] })
}