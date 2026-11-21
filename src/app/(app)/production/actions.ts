"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { aujourdhui, dateValide, serviceValide, versDate } from "@/lib/menus"
import { calculerPrevisions, chargerCommande } from "@/lib/prevision"
import { ORDRE_TYPES_EVENEMENT, ORDRE_TYPES_GASPILLAGE, type TypeEvenement, type TypeGaspillage } from "@/lib/prevision-base"
import { accesProductionCommande, accesProductionEcriture } from "@/lib/production-acces"

const texte = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "")
const entier = (v: string): number | null => (/^-?\d{1,7}$/.test(v) ? Number(v) : null)
const rafraichir = () => {
  revalidatePath("/production", "layout")
  revalidatePath("/analytics", "layout")
  revalidatePath("/", "layout")
}

export async function fixerPlan(date: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesProductionEcriture()
  if ("erreur" in a) return { error: a.erreur }
  if (!dateValide(date) || !serviceValide(service)) return { error: "Créneau invalide." }
  const brut = texte(fd.get("aProduire"))
  if (brut === "") {
    await db.planProduction.deleteMany({ where: { etablissementId: a.etabId, date: versDate(date), service } })
    rafraichir()
    return { ok: "Plan retiré." }
  }
  const aProduire = entier(brut)
  if (aProduire === null || aProduire < 0 || aProduire > 100000) return { error: "Quantité invalide : un entier entre 0 et 100 000." }
  const { lignes } = await calculerPrevisions(a.etabId, date, 1)
  const prevus = lignes.find((l) => l.service === service)?.prevision.prevu ?? 0
  await db.planProduction.upsert({
    where: { etablissementId_date_service: { etablissementId: a.etabId, date: versDate(date), service } },
    create: { etablissementId: a.etabId, date: versDate(date), service, prevus, aProduire, updatedBy: a.session.email },
    update: { prevus, aProduire, updatedBy: a.session.email },
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "PRODUCTION_PLAN", entity: "PlanProduction", entityId: date + "|" + service, details: `prévu ${prevus}, à produire ${aProduire}` })
  rafraichir()
  return { ok: "Plan enregistré." }
}

export async function ajouterEvenement(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesProductionEcriture()
  if ("erreur" in a) return { error: a.erreur }
  const type = texte(fd.get("type"))
  const debut = texte(fd.get("debut"))
  const fin = texte(fd.get("fin")) || debut
  const impact = entier(texte(fd.get("impact")))
  const libelle = texte(fd.get("libelle")).slice(0, 80)
  if (!(ORDRE_TYPES_EVENEMENT as string[]).includes(type)) return { error: "Type d'événement invalide." }
  if (!dateValide(debut) || !dateValide(fin)) return { error: "Dates invalides." }
  if (fin < debut) return { error: "La fin précède le début." }
  if (impact === null || impact < -100 || impact > 500) return { error: "Impact invalide : un entier entre -100 et 500 (en %)." }
  if (libelle.length < 2) return { error: "Donnez un libellé à l'événement." }
  const e = await db.evenementCantine.create({
    data: { etablissementId: a.etabId, type: type as TypeEvenement, debut: versDate(debut), fin: versDate(fin), impactPct: impact, libelle, createdBy: a.session.email },
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "EVENEMENT_CREE", entity: "EvenementCantine", entityId: e.id, details: `${libelle} (${impact} %)` })
  rafraichir()
  return { ok: "Événement ajouté." }
}

export async function supprimerEvenement(id: string, _fd: FormData): Promise<void> {
  const a = await accesProductionEcriture()
  if ("erreur" in a) return
  const r = await db.evenementCantine.deleteMany({ where: { id, etablissementId: a.etabId } })
  if (r.count > 0) await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "EVENEMENT_SUPPRIME", entity: "EvenementCantine", entityId: id })
  rafraichir()
}

export async function saisirGaspillage(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesProductionEcriture()
  if ("erreur" in a) return { error: a.erreur }
  const date = texte(fd.get("date"))
  const service = texte(fd.get("service"))
  const platId = texte(fd.get("platId"))
  const portions = entier(texte(fd.get("portions")))
  const type = texte(fd.get("type"))
  const note = texte(fd.get("note")).slice(0, 200)
  if (!dateValide(date) || date > aujourdhui()) return { error: "Date invalide : elle ne peut pas être dans le futur." }
  if (!serviceValide(service)) return { error: "Service invalide." }
  if (portions === null || portions < 1 || portions > 10000) return { error: "Portions invalides : un entier entre 1 et 10 000." }
  if (!(ORDRE_TYPES_GASPILLAGE as string[]).includes(type)) return { error: "Type de gaspillage invalide." }
  const plat = platId ? await db.plat.findFirst({ where: { id: platId, etablissementId: a.etabId }, include: { ingredients: { include: { ingredient: true } } } }) : null
  if (!plat) return { error: "Choisissez un plat." }
  const coutRecette = plat.ingredients.reduce((t, l) => t + Number(l.quantity) * Number(l.ingredient.unitCost), 0)
  const coutPortion = Math.round(coutRecette / (plat.portions > 0 ? plat.portions : 1))
  const g = await db.gaspillage.create({
    data: {
      etablissementId: a.etabId,
      date: versDate(date),
      service,
      platId: plat.id,
      platNom: plat.name,
      portions,
      coutPortion,
      cout: coutPortion * portions,
      type: type as TypeGaspillage,
      note: note || null,
      userEmail: a.session.email,
    },
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "GASPILLAGE_SAISI", entity: "Gaspillage", entityId: g.id, details: `${plat.name} x${portions} = ${g.cout}` })
  rafraichir()
  return { ok: "Gaspillage enregistré." }
}

export async function supprimerGaspillage(id: string, _fd: FormData): Promise<void> {
  const a = await accesProductionEcriture()
  if ("erreur" in a) return
  const r = await db.gaspillage.deleteMany({ where: { id, etablissementId: a.etabId } })
  if (r.count > 0) await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "GASPILLAGE_SUPPRIME", entity: "Gaspillage", entityId: id })
  rafraichir()
}

export async function genererBon(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesProductionCommande()
  if ("erreur" in a) return { error: a.erreur }
  const jours = entier(texte(fd.get("jours"))) ?? 3
  if (jours < 1 || jours > 14) return { error: "Horizon invalide : entre 1 et 14 jours." }
  const fournisseur = await db.fournisseur.findFirst({ where: { id: texte(fd.get("fournisseurId")), etablissementId: a.etabId } })
  if (!fournisseur) return { error: "Choisissez un fournisseur." }
  const commande = await chargerCommande(a.etabId, jours)
  const aPasser = commande.lignes.filter((l) => l.manque > 0)
  if (aPasser.length === 0) return { error: "Rien à commander : le stock couvre les besoins prévus." }
  let id = ""
  try {
    const bon = await db.bonCommande.create({
      data: {
        etablissementId: a.etabId,
        fournisseurId: fournisseur.id,
        note: `Prévision de production sur ${jours} jour(s)`,
        lignes: { create: aPasser.map((l) => ({ ingredientId: l.ingredientId, quantite: l.manque, prix: l.unitCost })) },
      },
    })
    id = bon.id
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "BON_GENERE_PREVISION", entity: "BonCommande", entityId: id, details: `${fournisseur.name}, ${aPasser.length} ligne(s), ${jours} j` })
  } catch (e) {
    console.error("Generation du bon en echec", e)
    return { error: "Génération impossible, réessayez." }
  }
  revalidatePath("/achats", "layout")
  rafraichir()
  redirect("/achats/" + id)
}