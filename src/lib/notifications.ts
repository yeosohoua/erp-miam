import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { db } from "@/lib/db"
import { numeroAffiche } from "@/lib/facturation-base"
import { SERVICES, ajouterJours, aujourdhui, formaterMontant, formaterNombre, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import {
  REGLAGES_DEFAUT,
  TENTATIVES_MAX,
  emailNotifValide,
  normaliserTelephone,
  texteSimple,
  type Canal,
  type Reglages,
} from "@/lib/notifications-base"
import { canalConfigure, envoyer } from "@/lib/notifications-envoi"
import { JOURS_ALERTE } from "@/lib/stock-base"

type Cible = { telephone?: string | null; email?: string | null }
type Canaux = { sms: boolean; whatsapp: boolean; email: boolean }
type Bilan = { crees: number; envoyes: number }
const NUL: Bilan = { crees: 0, envoyes: 0 }

const argent = (n: number, devise: string): string => texteSimple(formaterMontant(n, devise))
const jourFr = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(d)
const heureFr = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(d)
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))
const canauxDe = (r: Reglages): Canaux => ({ sms: r.sms, whatsapp: r.whatsapp, email: r.email })

export async function reglagesDe(etabId: string): Promise<Reglages> {
  const r = await db.parametresNotification.findUnique({ where: { etablissementId: etabId } })
  if (!r) return { ...REGLAGES_DEFAUT }
  return { sms: r.sms, whatsapp: r.whatsapp, email: r.email, relances: r.relances, recharges: r.recharges, soldeBas: r.soldeBas, seuilSoldeBas: r.seuilSoldeBas, repasServi: r.repasServi, alertesStock: r.alertesStock }
}

// Cree une ligne par canal et destinataire. La cle unique empeche d'envoyer deux fois le meme message.
async function creer(etabId: string, evenement: string, base: string, cibles: Cible[], sujet: string | null, message: string, canaux: Canaux): Promise<string[]> {
  const ids: string[] = []
  const texte = texteSimple(message)
  for (const c of cibles) {
    const tel = c.telephone ? normaliserTelephone(c.telephone) : null
    const mail = c.email && emailNotifValide(c.email.trim()) ? c.email.trim().toLowerCase() : null
    const taches: { canal: Canal; to: string }[] = []
    if (tel && canaux.sms) taches.push({ canal: "SMS", to: tel })
    if (tel && canaux.whatsapp) taches.push({ canal: "WHATSAPP", to: tel })
    if (mail && canaux.email) taches.push({ canal: "EMAIL", to: mail })
    for (const t of taches) {
      try {
        const n = await db.notification.create({
          data: { etablissementId: etabId, canal: t.canal, destinataire: t.to, sujet, message: texte, evenement, cle: base + "|" + t.canal + "|" + t.to },
        })
        ids.push(n.id)
      } catch (e) {
        if (!estDoublon(e)) console.error("Creation de notification en echec", e)
      }
    }
  }
  return ids
}

export async function traiterIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const lignes = await db.notification.findMany({ where: { id: { in: ids }, statut: { in: ["PENDING", "FAILED", "SKIPPED"] } } })
  await Promise.all(
    lignes.map(async (n) => {
      try {
        if (!(await canalConfigure(n.canal))) {
          await db.notification.update({ where: { id: n.id }, data: { statut: "SKIPPED", erreur: "Canal non configuré sur le serveur." } })
          return
        }
        const r = await envoyer({ canal: n.canal, to: n.destinataire, sujet: n.sujet, message: n.message })
        if (r.ok) await db.notification.update({ where: { id: n.id }, data: { statut: "SENT", envoyeLe: new Date(), tentatives: { increment: 1 }, erreur: null } })
        else await db.notification.update({ where: { id: n.id }, data: { statut: "FAILED", tentatives: { increment: 1 }, erreur: r.erreur } })
      } catch (e) {
        console.error("Traitement de notification en echec", e)
      }
    }),
  )
}

async function expedier(etabId: string, evenement: string, base: string, cibles: Cible[], sujet: string | null, message: string, canaux: Canaux): Promise<Bilan> {
  const ids = await creer(etabId, evenement, base, cibles, sujet, message, canaux)
  await traiterIds(ids)
  const envoyes = ids.length === 0 ? 0 : await db.notification.count({ where: { id: { in: ids }, statut: "SENT" } })
  return { crees: ids.length, envoyes }
}

// Reprise des messages en attente, en echec ou non envoyes (messages de moins de 2 jours : jamais de vieux messages d'un coup).
export async function reessayer(o: { etabId?: string; forcer: boolean }): Promise<{ traites: number; envoyes: number }> {
  const depuis = new Date(Date.now() - 2 * 86_400_000)
  const lignes = await db.notification.findMany({
    where: {
      ...(o.etabId ? { etablissementId: o.etabId } : {}),
      statut: { in: ["PENDING", "FAILED", "SKIPPED"] },
      createdAt: { gte: depuis },
      ...(o.forcer ? {} : { tentatives: { lt: TENTATIVES_MAX } }),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true },
  })
  const ids = lignes.map((l) => l.id)
  await traiterIds(ids)
  const envoyes = ids.length === 0 ? 0 : await db.notification.count({ where: { id: { in: ids }, statut: "SENT" } })
  return { traites: ids.length, envoyes }
}

export async function notifierRelance(factureId: string, niveau: number): Promise<Bilan> {
  try {
    const f = await db.facture.findUnique({
      where: { id: factureId },
      include: { client: true, etablissement: { select: { name: true, currency: true } }, reglements: { select: { montant: true } } },
    })
    if (!f) return NUL
    const r = await reglagesDe(f.etablissementId)
    if (!r.relances) return NUL
    const d = f.etablissement.currency
    const reste = f.total - f.reglements.reduce((s, x) => s + x.montant, 0)
    const message =
      f.etablissement.name + " : rappel n°" + niveau + ". La facture " + numeroAffiche(f.numero) + " de " + argent(f.total, d) + " était à régler avant le " + (f.echeance ? jourFr(f.echeance) : "—") + ". Reste dû : " + argent(reste, d) + ". Merci de régulariser."
    return await expedier(f.etablissementId, "RELANCE", "relance:" + f.id + ":" + niveau, [{ telephone: f.client.phone, email: f.client.email }], "Rappel de paiement — facture " + numeroAffiche(f.numero), message, canauxDe(r))
  } catch (e) {
    console.error("Notification de relance en echec", e)
    return NUL
  }
}

async function destinatairesDe(inscritId: string): Promise<Cible[]> {
  const t = await db.tuteur.findMany({ where: { inscritId }, select: { phone: true, email: true } })
  return t.map((x) => ({ telephone: x.phone, email: x.email }))
}

export async function notifierRecharge(inscritId: string, montant: number): Promise<Bilan> {
  try {
    const i = await db.inscrit.findUnique({ where: { id: inscritId }, include: { etablissement: { select: { name: true, currency: true } } } })
    if (!i) return NUL
    const r = await reglagesDe(i.etablissementId)
    if (!r.recharges) return NUL
    const d = i.etablissement.currency
    const message = i.etablissement.name + " : recharge de " + argent(montant, d) + " reçue pour " + i.firstName + " " + i.lastName + ". Nouveau solde : " + argent(i.solde, d) + "."
    return await expedier(i.etablissementId, "RECHARGE", "recharge:" + randomUUID(), await destinatairesDe(i.id), "Recharge reçue — " + i.firstName, message, canauxDe(r))
  } catch (e) {
    console.error("Notification de recharge en echec", e)
    return NUL
  }
}

// Apres un repas servi : confirmation au tuteur et alerte si le solde passe sous le seuil.
export async function notifierApresService(o: { etabId: string; inscritId: string; reservationId: string; service: ServiceMenu; solde: number | null }): Promise<void> {
  try {
    const i = await db.inscrit.findUnique({ where: { id: o.inscritId }, include: { etablissement: { select: { name: true, currency: true } } } })
    if (!i) return
    const r = await reglagesDe(o.etabId)
    const cibles = await destinatairesDe(i.id)
    if (cibles.length === 0) return
    const d = i.etablissement.currency
    if (r.repasServi) {
      await expedier(o.etabId, "REPAS_SERVI", "repas:" + o.reservationId, cibles, "Repas servi — " + i.firstName, i.etablissement.name + " : " + i.firstName + " a pris son repas (" + SERVICES[o.service] + ") à " + heureFr(new Date()) + ".", canauxDe(r))
    }
    if (r.soldeBas && o.solde !== null && o.solde <= r.seuilSoldeBas) {
      await expedier(
        o.etabId,
        "SOLDE_BAS",
        "soldebas:" + i.id + ":" + aujourdhui(),
        cibles,
        "Solde bas — " + i.firstName,
        i.etablissement.name + " : le solde de " + i.firstName + " est de " + argent(o.solde, d) + ". Pensez à recharger le compte.",
        canauxDe(r),
      )
    }
  } catch (e) {
    console.error("Notification apres service en echec", e)
  }
}

// Resume du jour pour le personnel : ingredients sous le seuil et lots perimes ou proches de la peremption.
export async function alerterStock(etabId: string): Promise<void> {
  try {
    const r = await reglagesDe(etabId)
    if (!r.alertesStock) return
    const jour = aujourdhui()
    const limite = ajouterJours(jour, JOURS_ALERTE)
    const [etab, ingredients, lots, users] = await Promise.all([
      db.etablissement.findUnique({ where: { id: etabId }, select: { name: true } }),
      db.ingredient.findMany({ where: { etablissementId: etabId, seuil: { gt: 0 } }, orderBy: { name: "asc" }, select: { name: true, unit: true, stock: true, seuil: true } }),
      db.lot.findMany({
        where: { etablissementId: etabId, restante: { gt: 0 }, peremption: { not: null, lte: versDate(limite) } },
        orderBy: { peremption: "asc" },
        include: { ingredient: { select: { name: true, unit: true } } },
      }),
      db.user.findMany({
        where: { active: true, role: { in: ["ADMIN", "MANAGER", "STOREKEEPER", "PURCHASER"] }, etablissements: { some: { etablissementId: etabId } } },
        select: { email: true },
      }),
    ])
    if (!etab || users.length === 0) return
    const bas = ingredients.filter((i) => Number(i.stock) <= Number(i.seuil))
    if (bas.length === 0 && lots.length === 0) return
    const lignes: string[] = []
    for (const i of bas) lignes.push("- " + i.name + " : " + formaterNombre(Number(i.stock)) + " " + i.unit + " (seuil " + formaterNombre(Number(i.seuil)) + ")")
    for (const l of lots) {
      const iso = versIso(l.peremption as Date)
      lignes.push("- Lot " + l.reference + " (" + l.ingredient.name + ") : " + formaterNombre(Number(l.restante)) + " " + l.ingredient.unit + ", " + (iso < jour ? "périmé" : "périme") + " le " + iso)
    }
    const message = "Alerte stock — " + etab.name + "\n" + lignes.join("\n")
    const empreinte = createHash("sha1").update(message).digest("hex").slice(0, 12)
    await expedier(etabId, "STOCK", "stock:" + jour + ":" + empreinte, users.map((u) => ({ email: u.email })), "Alerte stock — " + etab.name, message, { sms: false, whatsapp: false, email: r.email })
  } catch (e) {
    console.error("Alerte stock en echec", e)
  }
}

// Message de test vers un canal precis, sans tenir compte des interrupteurs d'evenements.
export async function envoyerTest(etabId: string, canal: Canal, destinataire: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const etab = await db.etablissement.findUnique({ where: { id: etabId }, select: { name: true } })
  const message = "Message de test — " + (etab?.name ?? "Miam") + " : les notifications fonctionnent."
  const cible: Cible = canal === "EMAIL" ? { email: destinataire } : { telephone: destinataire }
  const ids = await creer(etabId, "TEST", "test:" + randomUUID(), [cible], "Message de test", message, { sms: canal === "SMS", whatsapp: canal === "WHATSAPP", email: canal === "EMAIL" })
  if (ids.length === 0) return { ok: false, erreur: "Destinataire invalide." }
  await traiterIds(ids)
  const n = await db.notification.findUnique({ where: { id: ids[0] }, select: { statut: true, erreur: true } })
  return n?.statut === "SENT" ? { ok: true } : { ok: false, erreur: n?.erreur ?? "Envoi impossible." }
}