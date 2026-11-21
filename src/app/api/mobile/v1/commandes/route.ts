import { erreur, json } from "@/lib/api-auth"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { SERVICES, ajouterJours, aujourdhui, dateValide, serviceValide, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import { choisirFiche, type Fiche } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"

class SoldeInsuffisant extends Error {}

type Ligne = { articleId: string | null; nom: string; prix: number; quantite: number; menuDate: string | null; service: string | null }

// Liste des commandes de la personne connectee (50 dernieres).
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const liste = await db.commandeMobile.findMany({
    where: { userId: a.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { lignes: true, etablissement: { select: { name: true, logoId: true } } },
  })
  return json({
    commandes: liste.map((c) => ({
      id: c.id,
      total: c.total,
      statut: c.statut,
      paiement: c.paiement === "SOLDE" ? "SOLDE" : "ESPECES",
      mode: c.mode,
      etablissement: { nom: c.etablissement.name, logo: c.etablissement.logoId ? "/api/mobile/v1/images/" + c.etablissement.logoId : null },
      date: c.createdAt.toISOString(),
      lignes: c.lignes.map((l) => ({ nom: l.nom, prix: l.prix, quantite: l.quantite })),
    })),
  })
}

// Nouvelle commande : le serveur recalcule les prix (article de la carte ou tarif du service), le client n'envoie jamais de prix.
// Compte prepaye : le solde est debite dans la meme transaction (refus si insuffisant). Sinon : a payer au retrait.
export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  let corps: { inscritId?: unknown; lignes?: unknown; mode?: unknown; paiement?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  if (!Array.isArray(corps.lignes) || corps.lignes.length === 0 || corps.lignes.length > 30) return erreur(400, "Panier vide ou trop volumineux (30 lignes maximum).")

  const mode = corps.mode === "SUR_PLACE" ? "SUR_PLACE" : corps.mode === "A_EMPORTER" ? "A_EMPORTER" : null
  if (!mode) return erreur(400, "Choisissez : manger sur place ou à emporter.")
  const moyen = corps.paiement === "PAYSTACK" ? "PAYSTACK" : corps.paiement === "ESPECES" ? "ESPECES" : null
  if (!moyen) return erreur(400, "Choisissez un moyen de paiement.")
  let etablissementId: string | undefined
  let f: Fiche | null = null
  if (a.role === "PARENT" || a.role === "ELEVE") {
    const r = await choisirFiche(a, typeof corps.inscritId === "string" ? corps.inscritId : null)
    if (r instanceof Response) return r
    if (r.statut !== "ACTIVE") return erreur(403, "Ce compte n'est pas actif.")
    f = r
    etablissementId = r.etablissementId
  } else if (a.role === "EMPLOYE") {
    etablissementId = a.etabIds[0]
  }
  if (!etablissementId) return erreur(403, "Commande indisponible pour ce compte.")

  const lignes: Ligne[] = []
  for (const brut of corps.lignes as Record<string, unknown>[]) {
    const q = typeof brut?.quantite === "number" && Number.isInteger(brut.quantite) ? brut.quantite : 0
    if (q < 1 || q > 20) return erreur(400, "Quantité invalide : de 1 à 20.")
    const articleId = brut.articleId
    const date = brut.date
    const service = brut.service
    if (typeof articleId === "string") {
      const art = await db.articleCarte.findFirst({ where: { id: articleId, etablissementId, active: true }, select: { id: true, nom: true, prix: true } })
      if (!art) return erreur(404, "Un article n'est plus disponible.")
      lignes.push({ articleId: art.id, nom: art.nom, prix: art.prix, quantite: q, menuDate: null, service: null })
    } else if (typeof date === "string" && typeof service === "string") {
      const jour = aujourdhui()
      if (!dateValide(date) || !serviceValide(service) || date < jour || date > ajouterJours(jour, 13)) return erreur(400, "Créneau de repas invalide.")
      const [menu, tarif] = await Promise.all([
        db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId, date: versDate(date), service } }, select: { statut: true } }),
        db.tarif.findUnique({ where: { etablissementId_service: { etablissementId, service } }, select: { prix: true } }),
      ])
      if (!menu || menu.statut !== "PUBLISHED") return erreur(404, "Aucun menu publié pour ce créneau.")
      if (!tarif || tarif.prix <= 0) return erreur(404, "Tarif indisponible pour ce repas.")
      lignes.push({ articleId: null, nom: (SERVICES[service as ServiceMenu] ?? service) + " du " + date, prix: tarif.prix, quantite: q, menuDate: date, service })
    } else {
      return erreur(400, "Ligne de commande invalide.")
    }
  }
  const total = lignes.reduce((s, l) => s + l.prix * l.quantite, 0)
  if (total <= 0 || total > 1_000_000) return erreur(400, "Montant de commande invalide.")
  // Paystack = paiement par le portefeuille (recharge Paystack faite avant). Espèces = paiement en caisse.
  if (moyen === "PAYSTACK" && !(f && f.etab.prepaye)) return erreur(400, "Le paiement Paystack n'est pas disponible pour ce compte.")
  const prepaye = moyen === "PAYSTACK"

  let id: string
  try {
    id = await db.$transaction(async (tx) => {
      const cmd = await tx.commandeMobile.create({
        data: {
          etablissementId,
          userId: a.userId,
          inscritId: f?.id ?? null,
          total,
          paiement: prepaye ? "SOLDE" : "ESPECES",
          mode,
          lignes: { create: lignes.map((l) => ({ articleId: l.articleId, nom: l.nom, prix: l.prix, quantite: l.quantite, menuDate: l.menuDate, service: l.service })) },
        },
      })
      if (prepaye && f) {
        const m = await tx.inscrit.updateMany({ where: { id: f.id, solde: { gte: total } }, data: { solde: { decrement: total } } })
        if (m.count === 0) throw new SoldeInsuffisant()
        await tx.transaction.create({ data: { etablissementId, inscritId: f.id, type: "DEBIT", montant: total, reference: "CMD-" + cmd.id, note: "Commande mobile", createdBy: a.email } })
      }
      return cmd.id
    })
  } catch (e) {
    if (e instanceof SoldeInsuffisant) return erreur(402, "Solde insuffisant : rechargez votre portefeuille.")
    throw e
  }
  await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "COMMANDE_MOBILE", entity: "CommandeMobile", entityId: id, details: total + " (" + (prepaye ? "portefeuille" : "espèces") + ", " + mode + ", mobile)" })
  const solde = f ? (await db.inscrit.findUnique({ where: { id: f.id }, select: { solde: true } }))?.solde ?? null : null
  return json({ id, total, paiement: prepaye ? "SOLDE" : "ESPECES", mode, statut: "EN_ATTENTE", date: versIso(new Date()), solde })
}