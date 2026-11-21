"use server"

import { revalidatePath } from "next/cache"

import { creerCle } from "@/lib/api-cle"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { definitionKpi } from "@/lib/pilotage-base"
import { accesApiAdmin, accesPilotageAdmin } from "@/lib/pilotage-acces"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => revalidatePath("/pilotage", "layout")
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Pilotage", entityId, details })
}

export async function definirObjectif(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPilotageAdmin()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const def = definitionKpi(nettoyer(fd.get("kpi")))
  const brut = nettoyer(fd.get("cible")).replace(",", ".")
  if (!def) return { error: "Choisissez un indicateur." }
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(brut)) return { error: "Cible invalide : un nombre positif." }
  const cible = Number(brut)
  await db.objectifKpi.upsert({
    where: { etablissementId_kpi: { etablissementId: etabId, kpi: def.id } },
    create: { etablissementId: etabId, kpi: def.id, cible, sens: def.sens, updatedBy: session.email },
    update: { cible, sens: def.sens, updatedBy: session.email },
  })
  await audit(session, "OBJECTIF_DEFINI", def.id, def.libelle + " · cible " + cible)
  rafraichir()
  return { ok: "Objectif enregistré : " + def.libelle + "." }
}

export async function supprimerObjectif(kpi: string, _fd: FormData): Promise<void> {
  const acces = await accesPilotageAdmin()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const r = await db.objectifKpi.deleteMany({ where: { etablissementId: etabId, kpi } })
  if (r.count > 0) await audit(session, "OBJECTIF_SUPPRIME", kpi, kpi)
  rafraichir()
}

export async function creerCleApi(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesApiAdmin()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const nom = nettoyer(fd.get("nom"))
  if (nom.length < 3 || nom.length > 60) return { error: "Nom invalide : de 3 à 60 caractères." }
  if ((await db.cleApi.count({ where: { etablissementId: etabId, actif: true } })) >= 10) return { error: "Dix clés actives au maximum : révoquez-en une avant d'en créer une autre." }
  const { cle, prefixe, hash } = creerCle()
  const c = await db.cleApi.create({ data: { etablissementId: etabId, nom, prefixe, hash, createdBy: session.email } })
  await audit(session, "CLE_API_CREEE", c.id, nom + " · préfixe " + prefixe)
  rafraichir()
  return { ok: "Clé « " + nom + " » créée : " + cle + " — copiez-la maintenant, elle ne sera plus jamais affichée." }
}

export async function revoquerCleApi(id: string, _fd: FormData): Promise<void> {
  const acces = await accesApiAdmin()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const c = await db.cleApi.findFirst({ where: { id, etablissementId: etabId, actif: true } })
  if (!c) return
  await db.cleApi.update({ where: { id: c.id }, data: { actif: false, revoqueeLe: new Date() } })
  await audit(session, "CLE_API_REVOQUEE", c.id, c.nom + " · préfixe " + c.prefixe)
  rafraichir()
}