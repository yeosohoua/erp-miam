"use server"

import { revalidatePath } from "next/cache"

import { accesAidesEcriture } from "@/lib/aides-acces"
import { dateIsoValide, periodeValide, typeAideValide, valeurAideValide } from "@/lib/aides-base"
import { jourIso, versDate } from "@/lib/aides"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"

const texte = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "")
const rafraichir = () => {
  revalidatePath("/aides", "layout")
  revalidatePath("/paiements", "layout")
}

export async function creerAide(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesAidesEcriture()
  if ("erreur" in a) return { error: a.erreur }
  const nom = texte(fd.get("nom")).slice(0, 60)
  const type = texte(fd.get("type"))
  const description = texte(fd.get("description")).slice(0, 200)
  if (nom.length < 2) return { error: "Donnez un nom à l'aide (2 caractères au moins)." }
  if (!typeAideValide(type)) return { error: "Type d'aide invalide." }
  const brut = texte(fd.get("valeur"))
  const valeur = type === "GRATUIT" ? 0 : /^\d+$/.test(brut) ? Number(brut) : Number.NaN
  if (!valeurAideValide(type, valeur)) return { error: type === "POURCENTAGE" ? "Pourcentage invalide : un entier de 1 à 100." : "Montant invalide : un entier entre 1 et 1 000 000." }
  const existe = await db.aide.findFirst({ where: { etablissementId: a.etabId, nom }, select: { id: true } })
  if (existe) return { error: "Une aide porte déjà ce nom." }
  try {
    const aide = await db.aide.create({ data: { etablissementId: a.etabId, nom, type, valeur, description: description || null } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "AIDE_CREE", entity: "Aide", entityId: aide.id, details: `${nom} ${type} ${valeur}` })
  } catch (e) {
    console.error("Creation de l'aide en echec", e)
    return { error: "Création impossible, réessayez." }
  }
  rafraichir()
  return { ok: "Aide " + nom + " créée." }
}

export async function basculerAide(id: string, _fd: FormData): Promise<void> {
  const a = await accesAidesEcriture()
  if ("erreur" in a) return
  const aide = await db.aide.findFirst({ where: { id, etablissementId: a.etabId }, select: { active: true, nom: true } })
  if (!aide) return
  await db.aide.updateMany({ where: { id, etablissementId: a.etabId }, data: { active: !aide.active } })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: aide.active ? "AIDE_DESACTIVEE" : "AIDE_ACTIVEE", entity: "Aide", entityId: id, details: aide.nom })
  rafraichir()
}

export async function attribuerAide(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesAidesEcriture()
  if ("erreur" in a) return { error: a.erreur }
  const identifiant = texte(fd.get("identifiant")).slice(0, 64)
  const aideId = texte(fd.get("aide"))
  const debut = texte(fd.get("debut")) || jourIso()
  const finBrut = texte(fd.get("fin"))
  const fin = finBrut === "" ? null : finBrut
  const motif = texte(fd.get("motif")).slice(0, 200)
  if (identifiant === "") return { error: "Indiquez le matricule ou le badge de l'inscrit." }
  const erreurPeriode = periodeValide(debut, fin)
  if (erreurPeriode) return { error: erreurPeriode }
  if (!dateIsoValide(debut)) return { error: "Date de début invalide." }
  const aide = await db.aide.findFirst({ where: { id: aideId, etablissementId: a.etabId, active: true }, select: { id: true, nom: true } })
  if (!aide) return { error: "Choisissez une aide active." }
  const inscrit = await db.inscrit.findFirst({
    where: { etablissementId: a.etabId, OR: [{ matricule: { equals: identifiant, mode: "insensitive" } }, { badge: identifiant }] },
    select: { id: true, matricule: true, statut: true },
  })
  if (!inscrit) return { error: "Inscrit introuvable dans cet établissement." }
  if (inscrit.statut !== "ACTIVE") return { error: "Cet inscrit n'est pas actif." }
  const dejaLa = await db.aideInscrit.findFirst({ where: { inscritId: inscrit.id, aideId: aide.id, debut: versDate(debut) }, select: { id: true } })
  if (dejaLa) return { error: "Cette aide est déjà attribuée à cet inscrit à cette date." }
  try {
    const at = await db.aideInscrit.create({ data: { etablissementId: a.etabId, inscritId: inscrit.id, aideId: aide.id, debut: versDate(debut), fin: fin ? versDate(fin) : null, motif: motif || null, createdBy: a.session.email } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "AIDE_ATTRIBUEE", entity: "AideInscrit", entityId: at.id, details: `${aide.nom} ${inscrit.matricule} ${debut}` })
  } catch (e) {
    console.error("Attribution en echec", e)
    return { error: "Attribution impossible, réessayez." }
  }
  rafraichir()
  return { ok: "Aide " + aide.nom + " attribuée à " + inscrit.matricule + "." }
}

export async function terminerAttribution(id: string, _fd: FormData): Promise<void> {
  const a = await accesAidesEcriture()
  if ("erreur" in a) return
  const at = await db.aideInscrit.findFirst({ where: { id, etablissementId: a.etabId }, select: { debut: true, fin: true, inscrit: { select: { matricule: true } }, aide: { select: { nom: true } } } })
  if (!at) return
  const aujourdhui = versDate(jourIso())
  if (at.debut > aujourdhui) {
    await db.aideInscrit.deleteMany({ where: { id, etablissementId: a.etabId } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "AIDE_RETIREE", entity: "AideInscrit", entityId: id, details: `${at.aide.nom} ${at.inscrit.matricule}` })
  } else if (at.fin === null || at.fin > aujourdhui) {
    await db.aideInscrit.updateMany({ where: { id, etablissementId: a.etabId }, data: { fin: aujourdhui } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "AIDE_TERMINEE", entity: "AideInscrit", entityId: id, details: `${at.aide.nom} ${at.inscrit.matricule}` })
  }
  rafraichir()
}