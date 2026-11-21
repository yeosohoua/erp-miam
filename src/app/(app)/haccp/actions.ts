"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { FREQUENCES, GRAVITES, TYPES_EQUIPEMENT, DUREE_CONSERVATION_TEMOIN, ajouterJoursIso, ecartTemperature, graviteEcart, releveConforme, type FrequenceCle, type GraviteCle, type TypeEquipementCle } from "@/lib/haccp-base"
import { accesHaccpAdmin, accesHaccpEcriture } from "@/lib/haccp-acces"
import { aujourdhui, dateValide, serviceValide, versDate } from "@/lib/menus"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => revalidatePath("/haccp", "layout")
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const fr = (iso: string): string => iso.split("-").reverse().join("/")

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Haccp", entityId, details })
}

function temperature(s: string): number {
  const t = s.replace(",", ".")
  return /^-?\d{1,3}(\.\d)?$/.test(t) ? Number(t) : NaN
}

export async function creerEquipement(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpAdmin()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const nom = nettoyer(fd.get("nom"))
  const type = nettoyer(fd.get("type"))
  const min = temperature(nettoyer(fd.get("tempMin")))
  const max = temperature(nettoyer(fd.get("tempMax")))
  if (nom.length < 2 || nom.length > 60) return { error: "Nom invalide : de 2 à 60 caractères." }
  if (!(TYPES_EQUIPEMENT as readonly string[]).includes(type)) return { error: "Type d'équipement invalide." }
  if (Number.isNaN(min) || Number.isNaN(max) || min < -60 || max > 150) return { error: "Plage de température invalide." }
  if (min >= max) return { error: "La température minimale doit être inférieure à la maximale." }
  if (await db.equipement.findFirst({ where: { etablissementId: etabId, nom }, select: { id: true } })) return { error: "Un équipement porte déjà ce nom." }
  const e = await db.equipement.create({ data: { etablissementId: etabId, nom, type: type as TypeEquipementCle, tempMin: min, tempMax: max } })
  await audit(session, "EQUIPEMENT_CREE", e.id, nom + " · " + min + " à " + max + " °C")
  rafraichir()
  return { ok: "Équipement " + nom + " ajouté." }
}

export async function basculerEquipement(id: string, _fd: FormData): Promise<void> {
  const acces = await accesHaccpAdmin()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const e = await db.equipement.findFirst({ where: { id, etablissementId: etabId } })
  if (!e) return
  await db.equipement.update({ where: { id: e.id }, data: { actif: !e.actif } })
  await audit(session, e.actif ? "EQUIPEMENT_DESACTIVE" : "EQUIPEMENT_ACTIVE", e.id, e.nom)
  rafraichir()
}

export async function enregistrerReleve(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const equipementId = nettoyer(fd.get("equipementId"))
  const valeur = temperature(nettoyer(fd.get("valeur")))
  const action = nettoyer(fd.get("action"))
  if (!equipementId) return { error: "Choisissez un équipement." }
  if (Number.isNaN(valeur) || valeur < -60 || valeur > 150) return { error: "Température invalide." }
  if (action.length > 200) return { error: "Action corrective trop longue (200 caractères maximum)." }
  const eq = await db.equipement.findFirst({ where: { id: equipementId, etablissementId: etabId, actif: true } })
  if (!eq) return { error: "Équipement introuvable ou désactivé." }
  const min = Number(eq.tempMin)
  const max = Number(eq.tempMax)
  const conforme = releveConforme(valeur, min, max)
  if (!conforme && action === "") return { error: "Hors plage : indiquez l'action corrective." }
  const r = await db.releveTemperature.create({ data: { etablissementId: etabId, equipementId: eq.id, valeur, conforme, par: session.email, action: action || null } })
  let suite = ""
  if (!conforme) {
    const gravite = graviteEcart(ecartTemperature(valeur, min, max))
    await db.nonConformite.create({
      data: {
        etablissementId: etabId,
        titre: "Température hors plage : " + eq.nom,
        detail: valeur + " °C relevés (plage " + min + " à " + max + " °C)",
        gravite,
        source: "TEMPERATURE",
        actionCorrective: action,
        creePar: session.email,
      },
    })
    suite = " Une non-conformité " + gravite.toLowerCase() + " a été ouverte."
  }
  await audit(session, "RELEVE_ENREGISTRE", r.id, eq.nom + " · " + valeur + " °C · " + (conforme ? "conforme" : "hors plage"))
  rafraichir()
  return { ok: "Relevé enregistré : " + eq.nom + " à " + valeur + " °C, " + (conforme ? "conforme." : "hors plage.") + suite }
}

export async function creerTache(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpAdmin()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const nom = nettoyer(fd.get("nom"))
  const frequence = nettoyer(fd.get("frequence"))
  const zone = nettoyer(fd.get("zone"))
  if (nom.length < 3 || nom.length > 100) return { error: "Intitulé invalide : de 3 à 100 caractères." }
  if (!(FREQUENCES as readonly string[]).includes(frequence)) return { error: "Fréquence invalide." }
  if (zone.length > 60) return { error: "Zone trop longue (60 caractères maximum)." }
  if (await db.tacheHygiene.findFirst({ where: { etablissementId: etabId, nom }, select: { id: true } })) return { error: "Une tâche porte déjà cet intitulé." }
  const t = await db.tacheHygiene.create({ data: { etablissementId: etabId, nom, frequence: frequence as FrequenceCle, zone: zone || null } })
  await audit(session, "TACHE_CREEE", t.id, nom + " · " + frequence)
  rafraichir()
  return { ok: "Tâche d'hygiène ajoutée : " + nom + "." }
}

export async function basculerTache(id: string, _fd: FormData): Promise<void> {
  const acces = await accesHaccpAdmin()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const t = await db.tacheHygiene.findFirst({ where: { id, etablissementId: etabId } })
  if (!t) return
  await db.tacheHygiene.update({ where: { id: t.id }, data: { actif: !t.actif } })
  await audit(session, t.actif ? "TACHE_DESACTIVEE" : "TACHE_ACTIVEE", t.id, t.nom)
  rafraichir()
}

export async function validerTache(tacheId: string, _fd: FormData): Promise<void> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const t = await db.tacheHygiene.findFirst({ where: { id: tacheId, etablissementId: etabId, actif: true } })
  if (!t) return
  const jour = aujourdhui()
  if (await db.executionHygiene.findFirst({ where: { tacheId: t.id, date: versDate(jour) }, select: { id: true } })) return
  const x = await db.executionHygiene.create({ data: { etablissementId: etabId, tacheId: t.id, date: versDate(jour), faitPar: session.email } })
  await audit(session, "TACHE_FAITE", x.id, t.nom + " · " + jour)
  rafraichir()
}

export async function creerNonConformite(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const titre = nettoyer(fd.get("titre"))
  const detail = nettoyer(fd.get("detail"))
  const gravite = nettoyer(fd.get("gravite"))
  if (titre.length < 3 || titre.length > 120) return { error: "Titre invalide : de 3 à 120 caractères." }
  if (detail.length > 500) return { error: "Détail trop long (500 caractères maximum)." }
  if (!(GRAVITES as readonly string[]).includes(gravite)) return { error: "Gravité invalide." }
  const n = await db.nonConformite.create({ data: { etablissementId: etabId, titre, detail: detail || null, gravite: gravite as GraviteCle, source: "MANUELLE", creePar: session.email } })
  await audit(session, "NC_CREEE", n.id, titre + " · " + gravite)
  rafraichir()
  return { ok: "Non-conformité enregistrée : " + titre + "." }
}

export async function corrigerNonConformite(id: string, _p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const action = nettoyer(fd.get("action"))
  if (action.length < 3 || action.length > 300) return { error: "Action corrective invalide : de 3 à 300 caractères." }
  const n = await db.nonConformite.findFirst({ where: { id, etablissementId: etabId } })
  if (!n) return { error: "Non-conformité introuvable." }
  if (n.statut !== "OUVERTE") return { error: "Seule une non-conformité ouverte peut être corrigée." }
  await db.nonConformite.update({ where: { id: n.id }, data: { statut: "CORRIGEE", actionCorrective: action } })
  await audit(session, "NC_CORRIGEE", n.id, n.titre)
  rafraichir()
  return { ok: "Action corrective enregistrée pour " + n.titre + "." }
}

export async function cloturerNonConformite(id: string, _fd: FormData): Promise<void> {
  const acces = await accesHaccpAdmin()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const n = await db.nonConformite.findFirst({ where: { id, etablissementId: etabId } })
  if (!n || n.statut !== "CORRIGEE") return
  await db.nonConformite.update({ where: { id: n.id }, data: { statut: "CLOTUREE", closLe: new Date() } })
  await audit(session, "NC_CLOTUREE", n.id, n.titre)
  rafraichir()
}

export async function creerTemoin(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const date = nettoyer(fd.get("date"))
  const service = nettoyer(fd.get("service"))
  const platNom = nettoyer(fd.get("platNom"))
  const emplacement = nettoyer(fd.get("emplacement"))
  if (!dateValide(date) || date > aujourdhui()) return { error: "Date invalide (pas dans le futur)." }
  if (!serviceValide(service)) return { error: "Choisissez un service." }
  if (platNom.length < 2 || platNom.length > 80) return { error: "Nom du plat invalide : de 2 à 80 caractères." }
  if (emplacement.length > 60) return { error: "Emplacement trop long (60 caractères maximum)." }
  if (await db.echantillonTemoin.findFirst({ where: { etablissementId: etabId, date: versDate(date), service, platNom }, select: { id: true } })) return { error: "Cet échantillon est déjà enregistré." }
  const fin = ajouterJoursIso(date, DUREE_CONSERVATION_TEMOIN)
  const x = await db.echantillonTemoin.create({ data: { etablissementId: etabId, date: versDate(date), service, platNom, conserveJusqu: versDate(fin), emplacement: emplacement || null, preparePar: session.email } })
  await audit(session, "TEMOIN_CREE", x.id, platNom + " · " + date + " · " + service)
  rafraichir()
  return { ok: "Échantillon témoin enregistré : " + platNom + ", conservé jusqu'au " + fr(fin) + "." }
}

export async function jeterTemoin(id: string, _fd: FormData): Promise<void> {
  const acces = await accesHaccpEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const x = await db.echantillonTemoin.findFirst({ where: { id, etablissementId: etabId } })
  if (!x || x.jete) return
  const fin = x.conserveJusqu.toISOString().slice(0, 10)
  if (aujourdhui() < fin) return
  await db.echantillonTemoin.update({ where: { id: x.id }, data: { jete: true } })
  await audit(session, "TEMOIN_JETE", x.id, x.platNom)
  rafraichir()
}