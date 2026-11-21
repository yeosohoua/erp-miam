"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { accesEcriture, nouveauBadge } from "@/lib/inscrits-acces"
import { analyserCsv, kindValide, matriculeValide, statutInscritValide, telephoneValide, typeInscritValide, type KindRef, type LigneImport, type TypeInscrit } from "@/lib/inscrits"
import { prochainMatricule } from "@/lib/inscrits-matricule"
import { assurerCodesEtab } from "@/lib/codes-acces"

type Saisie = { prenom: string; nom: string; type: TypeInscrit; groupeId: string | null; regimeId: string | null; allergies: string[] }

const rafraichir = () => revalidatePath("/inscrits", "layout")

async function refExiste(etabId: string, kind: KindRef, id: string): Promise<boolean> {
  return (await db.referentiel.findFirst({ where: { id, etablissementId: etabId, kind }, select: { id: true } })) !== null
}

async function lireSaisie(fd: FormData, etabId: string): Promise<{ erreur: string } | Saisie> {
  const prenom = String(fd.get("prenom") ?? "").trim()
  const nom = String(fd.get("nom") ?? "").trim()
  if (prenom.length < 1 || prenom.length > 60 || nom.length < 1 || nom.length > 60) return { erreur: "Le prénom et le nom sont obligatoires (60 caractères maximum)." }
  const type = String(fd.get("type") ?? "")
  if (!typeInscritValide(type)) return { erreur: "Type invalide." }
  const groupeId = String(fd.get("groupe") ?? "") || null
  const regimeId = String(fd.get("regime") ?? "") || null
  if (groupeId && !(await refExiste(etabId, "GROUPE", groupeId))) return { erreur: "Groupe inconnu." }
  if (regimeId && !(await refExiste(etabId, "REGIME", regimeId))) return { erreur: "Régime inconnu." }
  const allergies = [...new Set(fd.getAll("allergies").map(String))]
  if (allergies.length > 0) {
    const n = await db.referentiel.count({ where: { id: { in: allergies }, etablissementId: etabId, kind: "ALLERGIE" } })
    if (n !== allergies.length) return { erreur: "Allergie inconnue." }
  }
  return { prenom, nom, type, groupeId, regimeId, allergies }
}

export async function creerInscrit(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  let matricule = String(fd.get("matricule") ?? "").trim()
  if (matricule === "") matricule = await prochainMatricule(etabId, String(fd.get("type") ?? ""))
  if (!matriculeValide(matricule)) return { error: "Matricule invalide : 1 à 20 caractères (lettres, chiffres, tiret)." }
  const s = await lireSaisie(fd, etabId)
  if ("erreur" in s) return { error: s.erreur }
  if (await db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: etabId, matricule } }, select: { id: true } })) {
    return { error: "Ce matricule est déjà utilisé." }
  }
  try {
    const cree = await db.inscrit.create({
      data: {
        etablissementId: etabId,
        matricule,
        firstName: s.prenom,
        lastName: s.nom,
        type: s.type,
        groupeId: s.groupeId,
        regimeId: s.regimeId,
        badge: nouveauBadge(),
        allergies: { create: s.allergies.map((allergieId) => ({ allergieId })) },
      },
    })
    await assurerCodesEtab(etabId)
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INSCRIT_CREATED", entity: "Inscrit", entityId: cree.id, details: matricule })
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ce matricule est déjà utilisé." }
    throw e
  }
  rafraichir()
  return { ok: "Inscrit créé : " + matricule }
}

export async function modifierInscrit(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const existant = await db.inscrit.findFirst({ where: { id, etablissementId: etabId }, select: { matricule: true } })
  if (!existant) return { error: "Cet inscrit n'existe plus." }
  const s = await lireSaisie(fd, etabId)
  if ("erreur" in s) return { error: s.erreur }
  const statut = String(fd.get("statut") ?? "")
  if (!statutInscritValide(statut)) return { error: "Statut invalide." }
  await db.$transaction([
    db.inscrit.update({ where: { id }, data: { firstName: s.prenom, lastName: s.nom, type: s.type, statut, groupeId: s.groupeId, regimeId: s.regimeId } }),
    db.inscritAllergie.deleteMany({ where: { inscritId: id } }),
    db.inscritAllergie.createMany({ data: s.allergies.map((allergieId) => ({ inscritId: id, allergieId })) }),
  ])
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INSCRIT_UPDATED", entity: "Inscrit", entityId: id, details: existant.matricule + " " + statut })
  rafraichir()
  return { ok: "Inscrit enregistré." }
}

export async function regenererBadge(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const existant = await db.inscrit.findFirst({ where: { id, etablissementId: acces.etabId }, select: { matricule: true } })
  if (!existant) return { error: "Cet inscrit n'existe plus." }
  await db.inscrit.update({ where: { id }, data: { badge: nouveauBadge() } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "BADGE_REGENERATED", entity: "Inscrit", entityId: id, details: existant.matricule })
  rafraichir()
  return { ok: "Nouveau badge généré. L'ancien ne fonctionne plus." }
}

export async function ajouterTuteur(inscritId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const inscrit = await db.inscrit.findFirst({ where: { id: inscritId, etablissementId: acces.etabId }, select: { matricule: true } })
  if (!inscrit) return { error: "Cet inscrit n'existe plus." }
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 2 || nom.length > 80) return { error: "Le nom du tuteur doit contenir entre 2 et 80 caractères." }
  const tel = String(fd.get("tel") ?? "").trim()
  if (!telephoneValide(tel)) return { error: "Numéro de téléphone invalide." }
  const email = String(fd.get("email") ?? "").trim().toLowerCase()
  if (email !== "" && !z.email().safeParse(email).success) return { error: "Adresse e-mail invalide." }
  const relation = String(fd.get("relation") ?? "").trim()
  if (relation.length > 40) return { error: "Le lien de parenté est limité à 40 caractères." }
  if ((await db.tuteur.count({ where: { inscritId } })) >= 6) return { error: "Maximum 6 tuteurs par inscrit." }
  await db.tuteur.create({ data: { inscritId, name: nom, phone: tel || null, email: email || null, relation: relation || null } })
  await assurerCodesEtab(acces.etabId)
    await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "TUTEUR_ADDED", entity: "Inscrit", entityId: inscritId, details: inscrit.matricule + " " + nom })
  rafraichir()
  return { ok: "Tuteur ajouté." }
}

export async function retirerTuteur(inscritId: string, tuteurId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const inscrit = await db.inscrit.findFirst({ where: { id: inscritId, etablissementId: acces.etabId }, select: { matricule: true } })
  if (!inscrit) return { error: "Cet inscrit n'existe plus." }
  await db.tuteur.deleteMany({ where: { id: tuteurId, inscritId } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "TUTEUR_REMOVED", entity: "Inscrit", entityId: inscritId, details: inscrit.matricule })
  rafraichir()
  return { ok: "Tuteur retiré." }
}

export async function creerReferentiel(kind: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  if (!kindValide(kind)) return { error: "Type de référentiel invalide." }
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 1 || nom.length > 60) return { error: "Le nom doit contenir entre 1 et 60 caractères." }
  if (await db.referentiel.findFirst({ where: { etablissementId: acces.etabId, kind, name: nom }, select: { id: true } })) return { error: "Cet élément existe déjà." }
  try {
    const cree = await db.referentiel.create({ data: { etablissementId: acces.etabId, kind, name: nom } })
    await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "REFERENTIEL_CREATED", entity: "Referentiel", entityId: cree.id, details: kind + " " + nom })
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Cet élément existe déjà." }
    throw e
  }
  rafraichir()
  return { ok: "Ajouté." }
}

export async function supprimerReferentiel(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const r = await db.referentiel.findFirst({
    where: { id, etablissementId: acces.etabId },
    include: { _count: { select: { groupeInscrits: true, regimeInscrits: true, allergies: true } } },
  })
  if (!r) return { error: "Cet élément n'existe plus." }
  const usage = r._count.groupeInscrits + r._count.regimeInscrits + r._count.allergies
  if (usage > 0) return { error: "Utilisé par " + usage + " inscrit(s) : suppression impossible." }
  await db.referentiel.delete({ where: { id } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "REFERENTIEL_DELETED", entity: "Referentiel", entityId: id, details: r.kind + " " + r.name })
  rafraichir()
  return { ok: "Supprimé." }
}

export async function importerInscrits(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const texte = String(fd.get("texte") ?? "")
  if (texte.length > 200_000) return { error: "Fichier trop volumineux." }
  const r = analyserCsv(texte)
  if ("erreur" in r) return { error: r.erreur }

  const existants = await db.inscrit.findMany({ where: { etablissementId: etabId, matricule: { in: r.lignes.map((l) => l.matricule) } }, select: { matricule: true } })
  if (existants.length > 0) return { error: "Matricule déjà existant : " + existants.slice(0, 5).map((e) => e.matricule).join(", ") + (existants.length > 5 ? "…" : "") }

  const noms = (get: (l: LigneImport) => string) => [...new Set(r.lignes.map(get).filter((n) => n !== ""))]
  const groupes = noms((l) => l.groupe)
  const regimes = noms((l) => l.regime)

  await db.$transaction(async (tx) => {
    for (const [kind, liste] of [["GROUPE", groupes], ["REGIME", regimes]] as const) {
      for (const name of liste) {
        await tx.referentiel.upsert({
          where: { etablissementId_kind_name: { etablissementId: etabId, kind, name } },
          create: { etablissementId: etabId, kind, name },
          update: {},
        })
      }
    }
    const refs = await tx.referentiel.findMany({ where: { etablissementId: etabId, kind: { in: ["GROUPE", "REGIME"] } }, select: { id: true, kind: true, name: true } })
    const idDe = (kind: KindRef, name: string): string | null => (name === "" ? null : (refs.find((x) => x.kind === kind && x.name === name)?.id ?? null))
    await tx.inscrit.createMany({
      data: r.lignes.map((l) => ({
        etablissementId: etabId,
        matricule: l.matricule,
        firstName: l.prenom,
        lastName: l.nom,
        type: l.type,
        groupeId: idDe("GROUPE", l.groupe),
        regimeId: idDe("REGIME", l.regime),
        badge: nouveauBadge(),
      })),
    })
  })
  await assurerCodesEtab(etabId)
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INSCRITS_IMPORTED", entity: "Inscrit", details: r.lignes.length + " lignes, premier " + r.lignes[0].matricule })
  rafraichir()
  return { ok: r.lignes.length + " inscrit(s) importé(s)." }
}