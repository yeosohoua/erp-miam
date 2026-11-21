"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { emailValide } from "@/lib/facturation-base"
import { envoyerTest as envoyerTestMessage, reessayer } from "@/lib/notifications"
import { SEUIL_SOLDE_MAX, canalValide, normaliserTelephone } from "@/lib/notifications-base"
import { canalConfigure } from "@/lib/notifications-envoi"
import { accesNotificationsEcriture } from "@/lib/notifications-acces"
import { parseMontant } from "@/lib/paiements-base"

const rafraichir = () => revalidatePath("/parametres/notifications", "layout")
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const coche = (fd: FormData, nom: string): boolean => fd.get(nom) === "on"

export async function enregistrerReglages(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesNotificationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const seuil = parseMontant(nettoyer(fd.get("seuil")))
  if (seuil === null || seuil > SEUIL_SOLDE_MAX) return { error: "Seuil invalide : un entier de 0 à " + SEUIL_SOLDE_MAX.toLocaleString("fr-FR") + "." }
  const data = {
    sms: coche(fd, "sms"),
    whatsapp: coche(fd, "whatsapp"),
    email: coche(fd, "email"),
    relances: coche(fd, "relances"),
    recharges: coche(fd, "recharges"),
    soldeBas: coche(fd, "soldeBas"),
    seuilSoldeBas: seuil,
    repasServi: coche(fd, "repasServi"),
    alertesStock: coche(fd, "alertesStock"),
  }
  await db.parametresNotification.upsert({ where: { etablissementId: etabId }, create: { etablissementId: etabId, ...data }, update: data })
  await ecrireAudit({
    userId: session.userId,
    userEmail: session.email,
    action: "NOTIF_REGLAGES",
    entity: "Etablissement",
    entityId: etabId,
    details: Object.entries(data).map(([k, v]) => k + "=" + v).join(" "),
  })
  rafraichir()
  return { ok: "Réglages enregistrés." }
}

export async function envoyerTest(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesNotificationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const canal = nettoyer(fd.get("canal"))
  const destinataire = nettoyer(fd.get("destinataire"))
  if (!canalValide(canal)) return { error: "Choisissez un canal." }
  if (canal === "EMAIL") {
    if (!emailValide(destinataire)) return { error: "Adresse e-mail invalide." }
  } else if (!normaliserTelephone(destinataire)) {
    return { error: "Numéro invalide : indiquez un numéro à 10 chiffres (07 07 07 07 07) ou international (+225…)." }
  }
  if (!(await canalConfigure(canal))) return { error: "Ce canal n'est pas configuré : renseignez-le dans Paramètres › Configuration (administrateur)." }
  const r = await envoyerTestMessage(etabId, canal, destinataire)
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "NOTIF_TEST", entity: "Etablissement", entityId: etabId, details: canal + " " + (r.ok ? "envoyé" : "échec") })
  rafraichir()
  return r.ok ? { ok: "Message de test envoyé." } : { error: "Échec d'envoi : " + r.erreur }
}

export async function reessayerEchecs(_etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesNotificationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const r = await reessayer({ etabId, forcer: true })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "NOTIF_REESSAI", entity: "Etablissement", entityId: etabId, details: r.traites + " traité(s), " + r.envoyes + " envoyé(s)" })
  rafraichir()
  return { ok: r.traites === 0 ? "Aucun message à reprendre." : r.traites + " message(s) repris, " + r.envoyes + " envoyé(s)." }
}