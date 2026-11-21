import "server-only"

import { hash } from "bcryptjs"
import { createHmac, randomBytes, randomInt } from "node:crypto"

import { ALPHABET_CODE, LONGUEUR_CODE } from "@/lib/codes-acces-base"
import { db } from "@/lib/db"
import { chiffrer } from "@/lib/secret-box"

export type CibleCode = "INSCRIT" | "EMPLOYE" | "PARENT"
type Lien = { inscritId?: string; employeId?: string; tuteurEmail?: string }

// Le code est retrouve par son empreinte (HMAC) et reste affichable a l'administration grace au chiffrement.
export function hacherCodeAcces(code: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET manquant ou trop court")
  return createHmac("sha256", secret).update("acces:" + code).digest("hex")
}

export function genererCode(): string {
  let code = ""
  for (let i = 0; i < LONGUEUR_CODE; i++) code += ALPHABET_CODE[randomInt(ALPHABET_CODE.length)]
  return code
}

const estCollision = (e: unknown): boolean => (e as { code?: string }).code === "P2002"

async function creerCode(etablissementId: string, cible: CibleCode, lien: Lien): Promise<boolean> {
  for (let essai = 0; essai < 12; essai++) {
    const code = genererCode()
    try {
      await db.codeAcces.create({ data: { etablissementId, cible, ...lien, codeHash: hacherCodeAcces(code), codeChiffre: chiffrer(code) } })
      return true
    } catch (e) {
      if (!estCollision(e)) throw e
      const existe = await db.codeAcces.findFirst({ where: { etablissementId, ...lien }, select: { id: true } })
      if (existe) return false
    }
  }
  throw new Error("Impossible de generer un code unique")
}

// Cree les codes manquants de l'etablissement (inscrits, employes, parents avec e-mail). Idempotent, ne leve jamais d'erreur.
export async function assurerCodesEtab(etablissementId: string): Promise<{ crees: number }> {
  let crees = 0
  try {
    const inscrits = await db.inscrit.findMany({ where: { etablissementId, statut: { not: "LEFT" }, codeAcces: null }, select: { id: true } })
    for (const i of inscrits) if (await creerCode(etablissementId, "INSCRIT", { inscritId: i.id })) crees++

    const employes = await db.employeRh.findMany({ where: { etablissementId, actif: true, codeAcces: null }, select: { id: true } })
    for (const x of employes) if (await creerCode(etablissementId, "EMPLOYE", { employeId: x.id })) crees++

    const tuteurs = await db.tuteur.findMany({ where: { email: { not: null }, inscrit: { etablissementId, statut: { not: "LEFT" } } }, select: { email: true } })
    const emails = [...new Set(tuteurs.map((t) => (t.email ?? "").trim().toLowerCase()).filter((e) => e !== ""))]
    const existants = new Set((await db.codeAcces.findMany({ where: { etablissementId, cible: "PARENT" }, select: { tuteurEmail: true } })).map((c) => c.tuteurEmail))
    for (const e of emails) if (!existants.has(e) && (await creerCode(etablissementId, "PARENT", { tuteurEmail: e }))) crees++
  } catch (e) {
    console.error("Codes d'acces : generation incomplete", e)
  }
  return { crees }
}

// Nouveau code pour une personne : l'ancien cesse de fonctionner et ses sessions ouvertes sont fermees.
export async function regenererCode(id: string, etablissementId: string): Promise<boolean> {
  const c = await db.codeAcces.findFirst({ where: { id, etablissementId }, select: { userId: true } })
  if (!c) return false
  for (let essai = 0; essai < 12; essai++) {
    const code = genererCode()
    try {
      await db.codeAcces.update({ where: { id }, data: { codeHash: hacherCodeAcces(code), codeChiffre: chiffrer(code), actif: true } })
      if (c.userId) await db.user.updateMany({ where: { id: c.userId }, data: { tokenVersion: { increment: 1 } } })
      return true
    } catch (e) {
      if (!estCollision(e)) throw e
    }
  }
  return false
}

export async function basculerCodeActif(id: string, etablissementId: string): Promise<boolean | null> {
  const c = await db.codeAcces.findFirst({ where: { id, etablissementId }, select: { actif: true, userId: true } })
  if (!c) return null
  await db.codeAcces.update({ where: { id }, data: { actif: !c.actif } })
  if (c.actif && c.userId) await db.user.updateMany({ where: { id: c.userId }, data: { tokenVersion: { increment: 1 } } })
  return !c.actif
}

export type ConnexionCode = { erreur: string } | { user: { id: string; role: string; name: string; email: string; tokenVersion: number }; cible: CibleCode }

const resume = (u: { id: string; role: unknown; name: string; email: string; tokenVersion: number }) => ({ id: u.id, role: String(u.role), name: u.name, email: u.email, tokenVersion: u.tokenVersion })
const REFUS = "Ce compte n'est pas actif. Adressez-vous à votre établissement."

async function utilisateurLie(c: { id: string; userId: string | null; etablissementId: string }, email: string, name: string, role: "ELEVE" | "EMPLOYE") {
  let user = c.userId ? await db.user.findUnique({ where: { id: c.userId } }) : await db.user.findUnique({ where: { email } })
  if (!user) {
    try {
      user = await db.user.create({
        data: { email, name, passwordHash: await hash(randomBytes(24).toString("hex"), 10), role, etablissements: { create: [{ etablissementId: c.etablissementId }] } },
      })
    } catch (e) {
      if (!estCollision(e)) throw e
      user = await db.user.findUnique({ where: { email } })
    }
  }
  if (!user) return null
  if (c.userId !== user.id) await db.codeAcces.update({ where: { id: c.id }, data: { userId: user.id } })
  if (user.name !== name) user = await db.user.update({ where: { id: user.id }, data: { name } })
  return user
}

// Trouve ou prepare le compte derriere un code valide. Eleves et employes recoivent un compte sans mot de passe utilisable.
export async function utilisateurPourCode(codeId: string): Promise<ConnexionCode> {
  const c = await db.codeAcces.findUnique({ where: { id: codeId }, include: { inscrit: true, employe: true } })
  if (!c || !c.actif) return { erreur: "Code ou établissement incorrect." }
  let user: Awaited<ReturnType<typeof utilisateurLie>> = null

  if (c.cible === "INSCRIT") {
    if (!c.inscrit || c.inscrit.statut !== "ACTIVE") return { erreur: REFUS }
    user = await utilisateurLie(c, "inscrit-" + c.inscrit.id.toLowerCase() + "@acces.miam.local", c.inscrit.firstName + " " + c.inscrit.lastName, "ELEVE")
  } else if (c.cible === "EMPLOYE") {
    if (!c.employe || !c.employe.actif) return { erreur: REFUS }
    user = await utilisateurLie(c, "employe-" + c.employe.id.toLowerCase() + "@acces.miam.local", c.employe.firstName + " " + c.employe.lastName, "EMPLOYE")
  } else {
    const email = (c.tuteurEmail ?? "").trim().toLowerCase()
    if (!email) return { erreur: REFUS }
    const existant = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })
    if (existant) {
      if (!existant.active) return { erreur: REFUS }
      if (String(existant.role) !== "PARENT" || existant.totpEnabled) return { erreur: "Ce compte est protégé : connectez-vous avec votre e-mail et votre mot de passe." }
      await db.userEtablissement.upsert({
        where: { userId_etablissementId: { userId: existant.id, etablissementId: c.etablissementId } },
        update: {},
        create: { userId: existant.id, etablissementId: c.etablissementId },
      })
      user = existant
    } else {
      const t = await db.tuteur.findFirst({ where: { email: { equals: email, mode: "insensitive" }, inscrit: { etablissementId: c.etablissementId } }, select: { name: true } })
      try {
        user = await db.user.create({
          data: { email, name: t?.name ?? email, passwordHash: await hash(randomBytes(24).toString("hex"), 10), role: "PARENT", etablissements: { create: [{ etablissementId: c.etablissementId }] } },
        })
        await db.codeAcces.update({ where: { id: c.id }, data: { userId: user.id } })
      } catch (e) {
        if (!estCollision(e)) throw e
        user = await db.user.findUnique({ where: { email } })
      }
    }
  }
  if (!user || !user.active) return { erreur: REFUS }
  await db.codeAcces.update({ where: { id: c.id }, data: { derniereConnexion: new Date() } })
  return { user: resume(user), cible: c.cible as CibleCode }
}