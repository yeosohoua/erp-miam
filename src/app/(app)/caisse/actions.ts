"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { accesCaisse, accesCaisseAnnulation, accesCaisseConfig, accesCaisseVente } from "@/lib/caisse-acces"
import { MODES, analyserPanier, modeValide, numeroTicket, parsePrix } from "@/lib/caisse-base"
import { annulerVenteComptoir, encaisser, type ResultatVente } from "@/lib/caisse"
import { rembourserVenteComptoir } from "@/lib/remboursement"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"

const texte = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "")
const rafraichir = () => {
  revalidatePath("/caisse", "layout")
  revalidatePath("/analytics", "layout")
  revalidatePath("/paiements", "layout")
  revalidatePath("/inscrits", "layout")
  revalidatePath("/", "layout")
}

export async function encaisserVente(panier: unknown, mode: unknown, identifiant: unknown, visiteur: unknown, recu?: unknown, remise?: unknown, partCompte?: unknown, cle?: unknown): Promise<ResultatVente> {
  const a = await accesCaisseVente()
  if ("erreur" in a) return { erreur: a.erreur }
  if (!modeValide(mode)) return { erreur: "Mode de paiement invalide." }
  const pct = typeof remise === "number" && Number.isInteger(remise) && remise >= 0 && remise <= 100 ? remise : 0
  if (pct > 0) {
    const g = await accesCaisse()
    if (!g || !g.config) return { erreur: "Les remises sont réservées au gestionnaire et à l'administrateur." }
  }
  const p = analyserPanier(panier)
  if ("erreur" in p) return { erreur: p.erreur }
  const r = await encaisser({
    etabId: a.etabId,
    userEmail: a.session.email,
    lignes: p.lignes,
    mode,
    identifiant: typeof identifiant === "string" ? identifiant.slice(0, 64) : "",
    visiteur: typeof visiteur === "string" ? visiteur.slice(0, 60) : "",
    recu: typeof recu === "number" && Number.isInteger(recu) && recu >= 0 && recu <= 1_000_000_000 ? recu : null,
    remisePct: pct,
    partCompte: typeof partCompte === "number" && Number.isInteger(partCompte) && partCompte > 0 && partCompte <= 1_000_000_000 ? partCompte : 0,
    cle: typeof cle === "string" && /^[A-Za-z0-9-]{8,64}$/.test(cle) ? cle : undefined,
  })
  if ("ok" in r) {
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "VENTE_COMPTOIR", entity: "VenteComptoir", entityId: String(r.numero), details: `${numeroTicket(r.numero)} ${MODES[mode]} ${r.total}` })
    rafraichir()
  }
  return r
}

export async function annulerVente(id: string, _fd: FormData): Promise<void> {
  const a = await accesCaisseAnnulation()
  if ("erreur" in a) return
  const r = await annulerVenteComptoir({ etabId: a.etabId, userEmail: a.session.email, venteId: id })
  if ("ok" in r) {
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "VENTE_ANNULEE", entity: "VenteComptoir", entityId: String(r.numero), details: `${numeroTicket(r.numero)} ${r.total}` })
    rafraichir()
  }
}

export async function creerArticle(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const nom = texte(fd.get("nom")).slice(0, 60)
  const prix = parsePrix(texte(fd.get("prix")))
  const categorie = texte(fd.get("categorie")).slice(0, 40)
  if (nom.length < 2) return { error: "Donnez un nom à l'article (2 caractères au moins)." }
  if (prix === null) return { error: "Prix invalide : un entier entre 1 et 1 000 000." }
  const existe = await db.articleCarte.findFirst({ where: { etablissementId: a.etabId, nom }, select: { id: true } })
  if (existe) return { error: "Un article porte déjà ce nom." }
  try {
    const art = await db.articleCarte.create({ data: { etablissementId: a.etabId, nom, prix, categorie: categorie || null } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "ARTICLE_CREE", entity: "ArticleCarte", entityId: art.id, details: `${nom} ${prix}` })
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Un article porte déjà ce nom." }
    console.error("Creation de l'article en echec", e)
    return { error: "Création impossible, réessayez." }
  }
  rafraichir()
  return { ok: "Article " + nom + " ajouté." }
}

export async function majPrixArticle(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const prix = parsePrix(texte(fd.get("prix")))
  if (prix === null) return { error: "Prix invalide : un entier entre 1 et 1 000 000." }
  const r = await db.articleCarte.updateMany({ where: { id, etablissementId: a.etabId }, data: { prix } })
  if (r.count === 0) return { error: "Article introuvable." }
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "ARTICLE_PRIX", entity: "ArticleCarte", entityId: id, details: String(prix) })
  rafraichir()
  return { ok: "Prix mis à jour." }
}

export async function basculerArticle(id: string, _fd: FormData): Promise<void> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return
  const art = await db.articleCarte.findFirst({ where: { id, etablissementId: a.etabId }, select: { active: true, nom: true } })
  if (!art) return
  await db.articleCarte.updateMany({ where: { id, etablissementId: a.etabId }, data: { active: !art.active } })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: art.active ? "ARTICLE_DESACTIVE" : "ARTICLE_ACTIVE", entity: "ArticleCarte", entityId: id, details: art.nom })
  rafraichir()
}

export async function rembourserVente(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseAnnulation()
  if ("erreur" in a) return { error: a.erreur }
  const montant = parsePrix(texte(fd.get("montant")))
  const motif = texte(fd.get("motif"))
  if (montant === null) return { error: "Montant invalide : un entier positif." }
  if (motif.length < 3 || motif.length > 200) return { error: "Indiquez le motif (3 à 200 caractères)." }
  const r = await rembourserVenteComptoir({ etabId: a.etabId, userEmail: a.session.email, venteId: id, montant, motif })
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "VENTE_REMBOURSEE", entity: "VenteComptoir", entityId: String(r.numero), details: `${numeroTicket(r.numero)} -${r.montant} ${motif}` })
  rafraichir()
  return { ok: "Remboursement de " + r.montant + " FCFA enregistré. Reste remboursable : " + r.reste + " FCFA." }
}
