"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { aujourdhui, dateValide, versDate, versIso } from "@/lib/menus"
import { accesPersonnelEcriture } from "@/lib/personnel-acces"
import { STATUTS_POINTAGE, TYPES_CERTIFICATION, TYPES_CONGE, formaterJours, joursOuvrables, soldeConges, type StatutPointageCle, type TypeCertificationCle, type TypeCongeCle } from "@/lib/rh-avance-base"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => revalidatePath("/personnel", "layout")
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Personnel", entityId, details: details })
}

async function trouverEmploye(etabId: string, id: string) {
  if (id.length < 1 || id.length > 64) return null
  return db.employeRh.findFirst({ where: { id, etablissementId: etabId, actif: true } })
}

export async function demanderConge(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPersonnelEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const type = nettoyer(fd.get("type"))
  const debut = nettoyer(fd.get("debut"))
  const fin = nettoyer(fd.get("fin"))
  const motif = nettoyer(fd.get("motif"))
  if (!(TYPES_CONGE as readonly string[]).includes(type)) return { error: "Choisissez un type de congé." }
  if (!dateValide(debut) || !dateValide(fin)) return { error: "Dates invalides." }
  if (fin < debut) return { error: "La fin ne peut pas précéder le début." }
  const jours = joursOuvrables(debut, fin)
  if (jours < 1 || jours > 365) return { error: "Période invalide : de 1 à 365 jours ouvrables (le dimanche n'est pas compté)." }
  if (motif.length > 200) return { error: "Motif trop long (200 caractères maximum)." }
  const employe = await trouverEmploye(etabId, nettoyer(fd.get("employeId")))
  if (!employe) return { error: "Employé introuvable ou inactif." }
  const existants = await db.conge.findMany({ where: { employeId: employe.id }, select: { type: true, statut: true, jours: true, debut: true, fin: true } })
  if (existants.some((c) => c.statut !== "REFUSE" && versIso(c.debut) <= fin && versIso(c.fin) >= debut)) return { error: "Cette période chevauche un autre congé de cet employé." }
  if (type === "ANNUEL") {
    const s = soldeConges(versIso(employe.dateEmbauche), aujourdhui(), existants)
    if (jours * 10 > s.disponible) return { error: "Solde de congés insuffisant : " + formaterJours(Math.max(0, s.disponible)) + " jour(s) disponible(s) pour " + jours + " demandé(s)." }
  }
  const c = await db.conge.create({ data: { etablissementId: etabId, employeId: employe.id, type: type as TypeCongeCle, debut: versDate(debut), fin: versDate(fin), jours, motif: motif || null } })
  await audit(session, "CONGE_DEMANDE", c.id, employe.matricule + " · " + type + " · " + debut + " au " + fin + " · " + jours + " j")
  rafraichir()
  return { ok: "Demande de congé enregistrée pour " + employe.matricule + " (" + jours + " jour(s) ouvrable(s))." }
}

async function decider(id: string, statut: "APPROUVE" | "REFUSE"): Promise<void> {
  const acces = await accesPersonnelEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const c = await db.conge.findFirst({ where: { id, etablissementId: etabId }, include: { employe: { select: { matricule: true, dateEmbauche: true } } } })
  if (!c || c.statut !== "DEMANDE") return
  if (statut === "APPROUVE" && c.type === "ANNUEL") {
    const autres = await db.conge.findMany({ where: { employeId: c.employeId, NOT: { id: c.id }, statut: "APPROUVE" }, select: { type: true, statut: true, jours: true } })
    const s = soldeConges(versIso(c.employe.dateEmbauche), aujourdhui(), autres)
    if (c.jours * 10 > s.acquis - s.pris) return
  }
  await db.conge.update({ where: { id: c.id }, data: { statut, decidePar: session.userId, decideLe: new Date() } })
  await audit(session, statut === "APPROUVE" ? "CONGE_APPROUVE" : "CONGE_REFUSE", c.id, c.employe.matricule + " · " + c.jours + " j")
  rafraichir()
}

export async function approuverConge(id: string, _fd: FormData): Promise<void> {
  await decider(id, "APPROUVE")
}

export async function refuserConge(id: string, _fd: FormData): Promise<void> {
  await decider(id, "REFUSE")
}

export async function enregistrerPointage(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPersonnelEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const date = nettoyer(fd.get("date"))
  const statut = nettoyer(fd.get("statut"))
  const retardBrut = nettoyer(fd.get("retard"))
  const note = nettoyer(fd.get("note"))
  if (!(STATUTS_POINTAGE as readonly string[]).includes(statut)) return { error: "Choisissez un statut de présence." }
  if (!dateValide(date) || date > aujourdhui()) return { error: "Date invalide (pas dans le futur)." }
  let retard = 0
  if (statut === "RETARD") {
    retard = /^\d{1,4}$/.test(retardBrut) ? Number(retardBrut) : 0
    if (retard < 1 || retard > 480) return { error: "Retard invalide : de 1 à 480 minutes." }
  }
  if (note.length > 200) return { error: "Note trop longue (200 caractères maximum)." }
  const employe = await trouverEmploye(etabId, nettoyer(fd.get("employeId")))
  if (!employe) return { error: "Employé introuvable ou inactif." }
  if (date < versIso(employe.dateEmbauche)) return { error: "Date antérieure à l'embauche." }
  const existant = await db.pointage.findFirst({ where: { employeId: employe.id, date: versDate(date) } })
  const donnees = { statut: statut as StatutPointageCle, minutesRetard: retard, note: note || null }
  const p = existant
    ? await db.pointage.update({ where: { id: existant.id }, data: donnees })
    : await db.pointage.create({ data: { etablissementId: etabId, employeId: employe.id, date: versDate(date), createdBy: session.userId, ...donnees } })
  await audit(session, "POINTAGE_ENREGISTRE", p.id, employe.matricule + " · " + date + " · " + statut + (retard ? " · " + retard + " min" : ""))
  rafraichir()
  return { ok: "Pointage enregistré pour " + employe.matricule + " le " + date + "." }
}

export async function ajouterCertification(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPersonnelEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const type = nettoyer(fd.get("type"))
  const delivree = nettoyer(fd.get("delivreeLe"))
  const expire = nettoyer(fd.get("expireLe"))
  const organisme = nettoyer(fd.get("organisme"))
  if (!(TYPES_CERTIFICATION as readonly string[]).includes(type)) return { error: "Choisissez un type de certification." }
  if (!dateValide(delivree) || !dateValide(expire)) return { error: "Dates invalides." }
  if (expire <= delivree) return { error: "L'expiration doit suivre la délivrance." }
  if (organisme.length > 80) return { error: "Organisme trop long (80 caractères maximum)." }
  const employe = await trouverEmploye(etabId, nettoyer(fd.get("employeId")))
  if (!employe) return { error: "Employé introuvable ou inactif." }
  const doublon = await db.certification.findFirst({ where: { employeId: employe.id, type: type as TypeCertificationCle, delivreeLe: versDate(delivree) } })
  if (doublon) return { error: "Cette certification est déjà enregistrée." }
  const c = await db.certification.create({ data: { etablissementId: etabId, employeId: employe.id, type: type as TypeCertificationCle, delivreeLe: versDate(delivree), expireLe: versDate(expire), organisme: organisme || null } })
  await audit(session, "CERTIFICATION_AJOUTEE", c.id, employe.matricule + " · " + type + " · expire le " + expire)
  rafraichir()
  return { ok: "Certification ajoutée pour " + employe.matricule + "." }
}

export async function supprimerCertification(id: string, _fd: FormData): Promise<void> {
  const acces = await accesPersonnelEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const c = await db.certification.findFirst({ where: { id, etablissementId: etabId }, include: { employe: { select: { matricule: true } } } })
  if (!c) return
  await db.certification.delete({ where: { id: c.id } })
  await audit(session, "CERTIFICATION_SUPPRIMEE", c.id, c.employe.matricule + " · " + c.type)
  rafraichir()
}