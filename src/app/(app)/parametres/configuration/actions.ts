"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { invaliderConfig, etatConfig } from "@/lib/config"
import { DEFINITIONS, groupeValide, normaliserConfig, validerConfig } from "@/lib/config-base"
import { chiffrerConfig } from "@/lib/config-chiffrement"
import { controleMotDePasse } from "@/lib/controle-mdp"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { PARAMETRES_ADMIN, hasRole } from "@/lib/permissions"

type Changement = { cle: string; valeur: string | null }

// Un secret laisse vide est conserve ; une valeur definie par le serveur (.env) n'est pas modifiable ici.
export async function enregistrerGroupe(groupe: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  if (!hasRole(session.role, PARAMETRES_ADMIN)) return { error: "Action réservée à l'administrateur." }
  if (!groupeValide(groupe)) return { error: "Groupe inconnu." }
  const etat = await etatConfig()
  const changements: Changement[] = []
  for (const d of DEFINITIONS.filter((x) => x.groupe === groupe)) {
    if (etat.sources[d.cle] === "ENV") continue
    const enBase = etat.sources[d.cle] === "BASE"
    const brut = String(fd.get(d.cle) ?? "").trim()
    const efface = fd.get("effacer-" + d.cle) === "on"
    if (d.secret) {
      if (efface) {
        if (enBase) changements.push({ cle: d.cle, valeur: null })
        continue
      }
      if (brut === "") continue
    } else if (brut === "") {
      if (enBase) changements.push({ cle: d.cle, valeur: null })
      continue
    }
    const valeur = normaliserConfig(d.cle, brut)
    const erreur = validerConfig(d.cle, valeur)
    if (erreur) return { error: d.libelle + " : " + erreur }
    if (!d.secret && enBase && etat.valeurs[d.cle] === valeur) continue
    changements.push({ cle: d.cle, valeur })
  }
  if (changements.length === 0) return { ok: "Aucun changement." }
  const refus = await controleMotDePasse(session.userId, String(fd.get("motdepasse") ?? ""))
  if (refus) return { error: refus }
  await db.$transaction(async (tx) => {
    for (const c of changements) {
      if (c.valeur === null) await tx.configuration.deleteMany({ where: { cle: c.cle } })
      else {
        const chiffre = chiffrerConfig(c.cle, c.valeur)
        await tx.configuration.upsert({ where: { cle: c.cle }, create: { cle: c.cle, valeur: chiffre, updatedBy: session.email }, update: { valeur: chiffre, updatedBy: session.email } })
      }
    }
  })
  invaliderConfig()
  // Les valeurs ne sont jamais ecrites dans le journal : seulement les noms des reglages touches.
  await ecrireAudit({
    userId: session.userId,
    userEmail: session.email,
    action: "CONFIG_MODIFIEE",
    entity: "Configuration",
    entityId: groupe,
    details: changements.map((c) => c.cle + (c.valeur === null ? " (effacé)" : " (modifié)")).join(", "),
  })
  revalidatePath("/", "layout")
  return { ok: "Configuration enregistrée." }
}