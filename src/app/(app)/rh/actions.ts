"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { assurerCodesEtab } from "@/lib/codes-acces"
import { moisValide } from "@/lib/compta-base"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { libellePeriode } from "@/lib/facturation-base"
import { aujourdhui, dateValide, versDate } from "@/lib/menus"
import { ErreurPaie, genererBulletins, validerPeriode } from "@/lib/paie"
import { accesPaieEcriture, accesPaieValidation } from "@/lib/paie-acces"
import { ORDRE_SITUATIONS, type Situation } from "@/lib/paie-base"

const MAX = 100_000_000
const rafraichir = () => {
  revalidatePath("/rh", "layout")
  revalidatePath("/comptabilite", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))

function entier(v: string, min: number, max: number): number | null {
  const s = v.replace(/[\s\u00a0\u202f]/g, "")
  if (!/^\d{1,12}$/.test(s)) return null
  const n = Number(s)
  return n >= min && n <= max ? n : null
}
function pourcent(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."))
  if (v.trim() === "" || !Number.isFinite(n) || n < 0 || n > 50) return null
  return Math.round(n * 100)
}

type DonneesEmploye = { matricule: string; firstName: string; lastName: string; poste: string | null; dateEmbauche: Date; salaireBase: number; primes: number; indemniteExoneree: number; situation: Situation; enfants: number; personnesCmu: number; telephone: string | null }

function lireEmploye(fd: FormData): { erreur: string } | { data: DonneesEmploye } {
  const matricule = nettoyer(fd.get("matricule"))
  const firstName = nettoyer(fd.get("firstName"))
  const lastName = nettoyer(fd.get("lastName"))
  const poste = nettoyer(fd.get("poste"))
  const embauche = nettoyer(fd.get("dateEmbauche"))
  const situation = nettoyer(fd.get("situation"))
  const telephone = nettoyer(fd.get("telephone"))
  const salaireBase = entier(nettoyer(fd.get("salaireBase")), 1, MAX)
  const primes = entier(nettoyer(fd.get("primes")) || "0", 0, MAX)
  const exo = entier(nettoyer(fd.get("indemniteExoneree")) || "0", 0, MAX)
  const enfants = entier(nettoyer(fd.get("enfants")) || "0", 0, 20)
  const cmu = entier(nettoyer(fd.get("personnesCmu")) || "1", 0, 10)
  if (!/^[A-Za-z0-9._-]{1,20}$/.test(matricule)) return { erreur: "Matricule invalide (1 à 20 caractères : lettres, chiffres, point, tiret)." }
  if (firstName.length < 1 || firstName.length > 60 || lastName.length < 1 || lastName.length > 60) return { erreur: "Nom et prénom sont obligatoires (60 caractères maximum)." }
  if (poste.length > 80) return { erreur: "Poste trop long (80 caractères maximum)." }
  if (!dateValide(embauche) || embauche > aujourdhui()) return { erreur: "Date d'embauche invalide (pas dans le futur)." }
  if (salaireBase === null) return { erreur: "Salaire de base invalide : un entier supérieur à zéro." }
  if (primes === null || exo === null) return { erreur: "Primes ou indemnité exonérée invalides." }
  if (exo > salaireBase + primes) return { erreur: "L'indemnité exonérée ne peut pas dépasser le brut." }
  if (!(ORDRE_SITUATIONS as string[]).includes(situation)) return { erreur: "Choisissez une situation familiale." }
  if (enfants === null) return { erreur: "Nombre d'enfants invalide (0 à 20)." }
  if (cmu === null) return { erreur: "Nombre de personnes couvertes (CMU) invalide (0 à 10)." }
  if (telephone.length > 30) return { erreur: "Téléphone trop long." }
  return { data: { matricule, firstName, lastName, poste: poste || null, dateEmbauche: versDate(embauche), salaireBase, primes, indemniteExoneree: exo, situation: situation as Situation, enfants, personnesCmu: cmu, telephone: telephone || null } }
}

export async function creerEmploye(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaieEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const l = lireEmploye(fd)
  if ("erreur" in l) return { error: l.erreur }
  try {
    const e = await db.employeRh.create({ data: { etablissementId: etabId, ...l.data } })
    await assurerCodesEtab(etabId)
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RH_EMPLOYE_CREE", entity: "EmployeRh", entityId: e.id, details: l.data.matricule })
    rafraichir()
    return { ok: "Employé " + l.data.matricule + " enregistré." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Ce matricule existe déjà." }
    console.error("Creation d'employe en echec", e)
    return { error: "Enregistrement impossible, réessayez." }
  }
}

export async function modifierEmploye(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaieEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const l = lireEmploye(fd)
  if ("erreur" in l) return { error: l.erreur }
  const existant = await db.employeRh.findFirst({ where: { id, etablissementId: etabId }, select: { id: true } })
  if (!existant) return { error: "Employé introuvable." }
  try {
    await db.employeRh.update({ where: { id }, data: l.data })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RH_EMPLOYE_MODIFIE", entity: "EmployeRh", entityId: id, details: l.data.matricule })
    rafraichir()
    return { ok: "Employé " + l.data.matricule + " mis à jour. Régénérez les bulletins en brouillon pour appliquer les changements." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Ce matricule existe déjà." }
    console.error("Modification d'employe en echec", e)
    return { error: "Mise à jour impossible, réessayez." }
  }
}

export async function basculerActif(id: string, _fd: FormData): Promise<void> {
  void _fd
  const acces = await accesPaieEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const e = await db.employeRh.findFirst({ where: { id, etablissementId: etabId }, select: { actif: true, matricule: true } })
  if (!e) return
  await db.employeRh.update({ where: { id }, data: { actif: !e.actif } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: e.actif ? "RH_EMPLOYE_DESACTIVE" : "RH_EMPLOYE_ACTIVE", entity: "EmployeRh", entityId: id, details: e.matricule })
  rafraichir()
}

export async function supprimerBrouillon(id: string, _fd: FormData): Promise<void> {
  void _fd
  const acces = await accesPaieEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const r = await db.bulletinPaie.deleteMany({ where: { id, etablissementId: etabId, statut: "DRAFT" } })
  if (r.count > 0) await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIE_BROUILLON_SUPPRIME", entity: "BulletinPaie", entityId: id })
  rafraichir()
}

function periodeAutorisee(periode: string): string | null {
  if (!moisValide(periode)) return "Mois invalide."
  if (periode > aujourdhui().slice(0, 7)) return "Impossible de traiter un mois à venir."
  return null
}

export async function genererAction(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaieEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const periode = nettoyer(fd.get("periode"))
  const refus = periodeAutorisee(periode)
  if (refus) return { error: refus }
  try {
    const r = await genererBulletins({ etabId, periode, userEmail: session.email })
    if (r.crees + r.recalcules + r.valides === 0) return { error: "Aucun employé actif à cette date." }
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIE_GENEREE", entity: "Etablissement", entityId: etabId, details: periode + " : " + r.crees + " créé(s), " + r.recalcules + " recalculé(s), " + r.valides + " déjà validé(s)" })
    rafraichir()
    return { ok: libellePeriode(periode) + " : " + r.crees + " bulletin(s) créé(s), " + r.recalcules + " recalculé(s), " + r.valides + " déjà validé(s)." }
  } catch (e) {
    console.error("Generation de la paie en echec", e)
    return { error: "Génération impossible, réessayez." }
  }
}

export async function validerAction(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaieValidation()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const periode = nettoyer(fd.get("periode"))
  const refus = periodeAutorisee(periode)
  if (refus) return { error: refus }
  try {
    const n = await validerPeriode({ etabId, periode })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIE_VALIDEE", entity: "Etablissement", entityId: etabId, details: periode + " : " + n + " bulletin(s)" })
    rafraichir()
    return { ok: n + " bulletin(s) validé(s) pour " + libellePeriode(periode) + ". Ils seront comptabilisés à la prochaine comptabilisation." }
  } catch (e) {
    if (e instanceof ErreurPaie) return { error: e.message }
    console.error("Validation de la paie en echec", e)
    return { error: "Validation impossible, réessayez." }
  }
}

const CHAMPS_POURCENT = ["retraiteSalarie", "retraitePatronal", "pf", "maternite", "at", "contribution", "apprentissage", "tfpc"] as const
const CHAMPS_ENTIER = ["plafondRetraite", "plafondAutres", "plancher", "cmuSalarie", "cmuPatronale", "ricfDemiPart"] as const

export async function enregistrerParametres(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaieValidation()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const bp: Record<string, number> = {}
  for (const k of CHAMPS_POURCENT) {
    const v = pourcent(nettoyer(fd.get(k)))
    if (v === null) return { error: "Taux invalide (" + k + ") : un pourcentage entre 0 et 50." }
    bp[k] = v
  }
  const ent: Record<string, number> = {}
  for (const k of CHAMPS_ENTIER) {
    const v = entier(nettoyer(fd.get(k)), 0, MAX)
    if (v === null) return { error: "Montant invalide (" + k + ")." }
    ent[k] = v
  }
  const data = {
    retraiteSalarieBp: bp.retraiteSalarie,
    retraitePatronalBp: bp.retraitePatronal,
    pfBp: bp.pf,
    materniteBp: bp.maternite,
    atBp: bp.at,
    contributionBp: bp.contribution,
    apprentissageBp: bp.apprentissage,
    tfpcBp: bp.tfpc,
    plafondRetraite: ent.plafondRetraite,
    plafondAutres: ent.plafondAutres,
    plancher: ent.plancher,
    cmuSalarie: ent.cmuSalarie,
    cmuPatronale: ent.cmuPatronale,
    ricfDemiPart: ent.ricfDemiPart,
    cnpsDeductibleIts: fd.get("cnpsDeductibleIts") === "on",
    updatedBy: session.email,
  }
  try {
    await db.parametresPaie.upsert({ where: { etablissementId: etabId }, create: { etablissementId: etabId, ...data }, update: data })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIE_PARAMETRES", entity: "Etablissement", entityId: etabId, details: "retraite " + bp.retraiteSalarie + "/" + bp.retraitePatronal + " bp, plancher " + ent.plancher + ", CNPS deductible ITS : " + String(data.cnpsDeductibleIts) })
    rafraichir()
    return { ok: "Paramètres de paie enregistrés. Régénérez les bulletins en brouillon pour les appliquer." }
  } catch (e) {
    console.error("Enregistrement des parametres de paie en echec", e)
    return { error: "Enregistrement impossible, réessayez." }
  }
}