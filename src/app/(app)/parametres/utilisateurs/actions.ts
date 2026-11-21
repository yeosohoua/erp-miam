"use server"

import { hash } from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { Role } from "@/generated/prisma/enums"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { validerMotDePasse } from "@/lib/password-policy"
import { UTILISATEURS_ADMIN, hasRole } from "@/lib/permissions"
import { cleLimite, effacerEchecs } from "@/lib/rate-limit"
import { ROLE_VALUES } from "@/lib/roles"

const roleValide = (v: string): boolean => (ROLE_VALUES as readonly string[]).includes(v)

async function lireEtablissements(fd: FormData): Promise<{ erreur: string } | string[]> {
  const ids = [...new Set(fd.getAll("etab").map(String))]
  if (ids.length === 0) return ids
  const trouves = await db.etablissement.count({ where: { id: { in: ids } } })
  if (trouves !== ids.length) return { erreur: "Établissement inconnu." }
  return ids
}

export async function creerUtilisateur(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) return { error: "Action réservée à l'administrateur." }

  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 2 || nom.length > 80) return { error: "Le nom doit contenir entre 2 et 80 caractères." }
  const email = String(fd.get("email") ?? "").trim().toLowerCase()
  if (!z.email().safeParse(email).success) return { error: "Adresse e-mail invalide." }
  const role = String(fd.get("role") ?? "")
  if (!roleValide(role)) return { error: "Rôle invalide." }
  const mdp = String(fd.get("mdp") ?? "")
  const erreurMdp = validerMotDePasse(mdp)
  if (erreurMdp) return { error: erreurMdp }
  const etabs = await lireEtablissements(fd)
  if ("erreur" in etabs) return { error: etabs.erreur }
  if (role !== "ADMIN" && etabs.length === 0) return { error: "Affectez au moins un établissement." }
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return { error: "Cette adresse e-mail est déjà utilisée." }

  const cree = await db.user.create({
    data: {
      name: nom,
      email,
      role: role as Role,
      passwordHash: await hash(mdp, 12),
      etablissements: { create: etabs.map((etablissementId) => ({ etablissementId })) },
    },
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "USER_CREATED", entity: "User", entityId: cree.id, details: email + " " + role })
  revalidatePath("/parametres/utilisateurs")
  return { ok: "Utilisateur créé." }
}

export async function modifierUtilisateur(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) return { error: "Action réservée à l'administrateur." }
  const cible = await db.user.findUnique({ where: { id }, select: { role: true, active: true, email: true } })
  if (!cible) return { error: "Cet utilisateur n'existe plus." }

  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 2 || nom.length > 80) return { error: "Le nom doit contenir entre 2 et 80 caractères." }
  const role = String(fd.get("role") ?? "")
  if (!roleValide(role)) return { error: "Rôle invalide." }
  const actif = fd.get("actif") === "on"

  if (id === session.userId && (role !== cible.role || !actif)) {
    return { error: "Vous ne pouvez pas modifier votre propre rôle ni désactiver votre propre compte." }
  }
  if (cible.role === "ADMIN" && cible.active && (role !== "ADMIN" || !actif)) {
    const autres = await db.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } })
    if (autres === 0) return { error: "Il doit rester au moins un administrateur actif." }
  }
  const etabs = await lireEtablissements(fd)
  if ("erreur" in etabs) return { error: etabs.erreur }
  if (role !== "ADMIN" && etabs.length === 0) return { error: "Affectez au moins un établissement." }

  // Un changement de role ou d'etat coupe les sessions ouvertes de la personne concernee.
  const securite = role !== cible.role || actif !== cible.active
  await db.$transaction([
    db.user.update({
      where: { id },
      data: { name: nom, role: role as Role, active: actif, ...(securite ? { tokenVersion: { increment: 1 } } : {}) },
    }),
    db.userEtablissement.deleteMany({ where: { userId: id } }),
    db.userEtablissement.createMany({ data: etabs.map((etablissementId) => ({ userId: id, etablissementId })) }),
  ])
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "USER_UPDATED", entity: "User", entityId: id, details: cible.email + " " + role + (actif ? "" : " desactive") })
  revalidatePath("/parametres/utilisateurs")
  revalidatePath("/parametres/utilisateurs/" + id)
  return { ok: "Utilisateur enregistré." }
}

export async function reinitialiserMotDePasse(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) return { error: "Action réservée à l'administrateur." }
  if (id === session.userId) return { error: "Pour votre propre mot de passe, utilisez « Mon compte »." }
  const cible = await db.user.findUnique({ where: { id }, select: { email: true } })
  if (!cible) return { error: "Cet utilisateur n'existe plus." }

  const mdp = String(fd.get("mdp") ?? "")
  const confirmation = String(fd.get("confirmation") ?? "")
  const erreurMdp = validerMotDePasse(mdp)
  if (erreurMdp) return { error: erreurMdp }
  if (mdp !== confirmation) return { error: "La confirmation ne correspond pas au mot de passe." }

  await db.user.update({ where: { id }, data: { passwordHash: await hash(mdp, 12), tokenVersion: { increment: 1 } } })
  await effacerEchecs(cleLimite(cible.email))
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PASSWORD_RESET", entity: "User", entityId: id, details: cible.email })
  return { ok: "Mot de passe réinitialisé." }
}