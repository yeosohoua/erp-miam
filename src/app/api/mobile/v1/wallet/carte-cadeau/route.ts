import { erreur, json } from "@/lib/api-auth"
import { ecrireAudit } from "@/lib/audit"
import { carteValide, hacherCarte, normaliserCarte } from "@/lib/cartes-cadeaux"
import { db } from "@/lib/db"
import { choisirFiche } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"

// Utilisation d'une carte cadeau : code a usage unique, valable dans l'etablissement de l'inscrit, anti-force-brute par compte.
export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const cle = cleLimite("carte-cadeau:" + a.userId)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) return erreur(429, "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s).")
  let corps: { inscritId?: unknown; code?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const f = await choisirFiche(a, typeof corps.inscritId === "string" ? corps.inscritId : null)
  if (f instanceof Response) return f
  if (f.statut !== "ACTIVE") return erreur(403, "Ce compte n'est pas actif.")
  const echec = async () => {
    await enregistrerEchec(cle, 10)
    await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "CARTE_CADEAU_ECHEC", entity: "Inscrit", entityId: f.id, details: f.matricule + " (mobile)" })
    return erreur(404, "Carte cadeau invalide ou déjà utilisée.")
  }
  const code = normaliserCarte(typeof corps.code === "string" ? corps.code : "")
  if (!carteValide(code)) return echec()
  const carte = await db.carteCadeau.findUnique({ where: { codeHash: hacherCarte(code) } })
  if (!carte || carte.statut !== "ACTIVE" || carte.etablissementId !== f.etablissementId) return echec()
  const ok = await db.$transaction(async (tx) => {
    const m = await tx.carteCadeau.updateMany({ where: { id: carte.id, statut: "ACTIVE" }, data: { statut: "UTILISEE", utiliseeLe: new Date(), inscritId: f.id } })
    if (m.count === 0) return false
    await tx.inscrit.update({ where: { id: f.id }, data: { solde: { increment: carte.montant } } })
    await tx.transaction.create({ data: { etablissementId: f.etablissementId, inscritId: f.id, type: "TOPUP", montant: carte.montant, reference: "CC-" + carte.id, note: "Carte cadeau", createdBy: a.email } })
    return true
  })
  if (!ok) return echec()
  await effacerEchecs(cle)
  await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "CARTE_CADEAU_OK", entity: "Inscrit", entityId: f.id, details: f.matricule + " " + carte.montant + " (mobile)" })
  const i = await db.inscrit.findUnique({ where: { id: f.id }, select: { solde: true } })
  return json({ ok: "Carte cadeau utilisée.", montant: carte.montant, solde: i ? Number(i.solde) : null })
}