"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { codeValide, deviseValide, normaliserCode, typeValide, type TypeEtablissement } from "@/lib/etablissements"
import { requireSession } from "@/lib/guards"
import { ETABLISSEMENTS_ADMIN, ETABLISSEMENT_EDITION, hasRole } from "@/lib/permissions"

type Saisie = { nom: string; type: TypeEtablissement; adresse: string | null; tel: string | null; email: string | null; devise: string }

function lireSaisie(fd: FormData): { erreur: string } | Saisie {
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 2 || nom.length > 80) return { erreur: "Le nom doit contenir entre 2 et 80 caractères." }
  const type = String(fd.get("type") ?? "")
  if (!typeValide(type)) return { erreur: "Type d'établissement invalide." }
  const adresse = String(fd.get("adresse") ?? "").trim()
  if (adresse.length > 200) return { erreur: "L'adresse est limitée à 200 caractères." }
  const tel = String(fd.get("tel") ?? "").trim()
  if (tel.length > 30 || !/^[0-9+().\s-]*$/.test(tel)) return { erreur: "Numéro de téléphone invalide." }
  const email = String(fd.get("email") ?? "").trim().toLowerCase()
  if (email !== "" && !z.email().safeParse(email).success) return { erreur: "Adresse e-mail invalide." }
  const devise = String(fd.get("devise") ?? "")
  if (!deviseValide(devise)) return { erreur: "Devise invalide." }
  return { nom, type, adresse: adresse || null, tel: tel || null, email: email || null, devise }
}

async function peutModifier(session: { userId: string; role: string }, etablissementId: string): Promise<boolean> {
  if (hasRole(session.role, ETABLISSEMENTS_ADMIN)) return true
  if (!hasRole(session.role, ETABLISSEMENT_EDITION)) return false
  const lien = await db.userEtablissement.findUnique({ where: { userId_etablissementId: { userId: session.userId, etablissementId } } })
  return lien !== null
}

export async function creerEtablissement(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!hasRole(session.role, ETABLISSEMENTS_ADMIN)) return { error: "Action réservée à l'administrateur." }
  const code = normaliserCode(String(fd.get("code") ?? ""))
  if (!codeValide(code)) return { error: "Code invalide : 2 à 12 caractères (lettres, chiffres, tirets)." }
  const s = lireSaisie(fd)
  if ("erreur" in s) return { error: s.erreur }
  if (await db.etablissement.findUnique({ where: { code }, select: { id: true } })) return { error: "Ce code est déjà utilisé." }

  try {
    const cree = await db.etablissement.create({
      data: { code, name: s.nom, type: s.type, address: s.adresse, phone: s.tel, email: s.email, currency: s.devise },
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "ETABLISSEMENT_CREATED", entity: "Etablissement", entityId: cree.id, details: code + " " + s.nom })
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ce code est déjà utilisé." }
    throw e
  }
  revalidatePath("/", "layout")
  return { ok: "Établissement créé." }
}

export async function modifierEtablissement(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!(await peutModifier(session, id))) return { error: "Vous ne pouvez pas modifier cet établissement." }
  const existant = await db.etablissement.findUnique({ where: { id }, select: { code: true } })
  if (!existant) return { error: "Cet établissement n'existe plus." }
  const s = lireSaisie(fd)
  if ("erreur" in s) return { error: s.erreur }
  await db.etablissement.update({
    where: { id },
    data: { name: s.nom, type: s.type, address: s.adresse, phone: s.tel, email: s.email, currency: s.devise },
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "ETABLISSEMENT_UPDATED", entity: "Etablissement", entityId: id, details: existant.code + " " + s.nom })
  revalidatePath("/", "layout")
  return { ok: "Établissement enregistré." }
}

export async function basculerEtablissement(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const session = await requireSession()
  if (!hasRole(session.role, ETABLISSEMENTS_ADMIN)) return { error: "Action réservée à l'administrateur." }
  const e = await db.etablissement.findUnique({ where: { id }, select: { code: true, active: true } })
  if (!e) return { error: "Cet établissement n'existe plus." }
  if (e.active && (await db.etablissement.count({ where: { active: true, id: { not: id } } })) === 0) {
    return { error: "Il doit rester au moins un établissement actif." }
  }
  await db.etablissement.update({ where: { id }, data: { active: !e.active } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: e.active ? "ETABLISSEMENT_DEACTIVATED" : "ETABLISSEMENT_ACTIVATED", entity: "Etablissement", entityId: id, details: e.code })
  revalidatePath("/", "layout")
  return { ok: e.active ? "Établissement désactivé." : "Établissement réactivé." }
}