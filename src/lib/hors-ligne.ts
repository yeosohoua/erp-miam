import type { ServiceMenu } from "@/lib/menus"
import type { ScanResultat } from "@/lib/service"

// Tout ce fichier tourne dans le navigateur (et les types servent aussi aux actions serveur).
export const NOM_CACHE = "miam-service-v1"

export type ItemHL = { id: string; nom: string; matricule: string; badge: string; groupe: string | null; regime: string | null; allergies: string[]; solde: number; prix?: number; servi: boolean; heure: string | null }
export type Instantane = {
  etabId: string
  userId: string
  service: ServiceMenu
  jour: string
  genereLe: number
  prix: number
  actif: boolean
  devise: string
  menuPublie: boolean
  items: ItemHL[]
  horsListe: string[]
}
export type Passage = { id: string; etabId: string; service: ServiceMenu; jour: string; code: string; forcer: boolean; at: number; nom: string }
export type EntreeSync = { id: string; code: string; service: ServiceMenu; jour: string; forcer: boolean; at: number }
export type IssueSync = { id: string; issue: "OK" | "DOUBLON" | "REJET"; message: string; nom: string }
export type RapportSync = { issues: IssueSync[] } | { erreur: string }

export const jourLocal = (): string => new Date().toISOString().slice(0, 10)
export const nouvelId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12)

const montant = (n: number, devise: string): string => n.toLocaleString("fr-FR").replace(/[\u00a0\u202f]/g, " ") + " " + (devise === "XOF" ? "F CFA" : devise)
const heure = (t: number): string => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(new Date(t))

export type Decision = { resultat: ScanResultat; snap: Instantane; passage: Passage | null }

// Memes regles que le scan en ligne, sur la liste preparee : deja servi, solde, absence de reservation, exception.
export function decider(snap: Instantane, code: string, forcer: boolean, maintenant: number): Decision {
  const at = maintenant
  const brut = code.trim()
  if (!snap.menuPublie) return { resultat: { at, statut: "FERME", message: "Aucun menu publié pour ce service : service fermé.", horsLigne: true }, snap, passage: null }
  const maj = brut.toUpperCase()
  const item = snap.items.find((i) => i.badge === maj || i.matricule === brut)
  if (item) {
    const resume = { id: item.id, nom: item.nom, matricule: item.matricule, groupe: item.groupe, regime: item.regime, allergies: item.allergies }
    if (item.servi) return { resultat: { at, statut: "DEJA", message: "Déjà servi" + (item.heure ? " à " + item.heure : "") + ".", inscrit: resume, heure: item.heure ?? undefined, horsLigne: true }, snap, passage: null }
    const prixItem = item.prix ?? snap.prix
    const insuffisant = snap.actif && item.solde < prixItem
    if (insuffisant && !forcer) {
      return {
        resultat: { at, statut: "SOLDE_INSUFFISANT", message: "Solde insuffisant : " + montant(item.solde, snap.devise) + " pour un repas à " + montant(prixItem, snap.devise) + ".", inscrit: resume, horsLigne: true },
        snap,
        passage: null,
      }
    }
    const debit = snap.actif ? prixItem : 0
    const h = heure(maintenant)
    const solde = item.solde - debit
    const suivant: Instantane = { ...snap, items: snap.items.map((i) => (i.id === item.id ? { ...i, servi: true, heure: h, solde } : i)) }
    const passage: Passage = { id: nouvelId(), etabId: snap.etabId, service: snap.service, jour: snap.jour, code: item.matricule, forcer: false, at: maintenant, nom: item.nom }
    return {
      resultat: { at, statut: "SERVI", message: "Repas servi (hors-ligne).", inscrit: resume, heure: h, paiement: debit > 0 ? "Débité " + montant(debit, snap.devise) + " · solde " + montant(solde, snap.devise) : undefined, horsLigne: true },
      snap: suivant,
      passage,
    }
  }
  const resume = { id: "", nom: "Code " + brut, matricule: brut, groupe: null, regime: null, allergies: [] as string[] }
  if (snap.horsListe.includes(maj)) return { resultat: { at, statut: "DEJA", message: "Déjà enregistré hors-ligne.", inscrit: resume, horsLigne: true }, snap, passage: null }
  if (!forcer) return { resultat: { at, statut: "SANS_RESERVATION", message: "Aucune réservation connue pour ce code (liste hors-ligne).", inscrit: resume, horsLigne: true }, snap, passage: null }
  const passage: Passage = { id: nouvelId(), etabId: snap.etabId, service: snap.service, jour: snap.jour, code: brut, forcer: true, at: maintenant, nom: "Code " + brut }
  return {
    resultat: { at, statut: "SERVI", message: "Servi hors réservation (exception, à synchroniser).", inscrit: resume, heure: heure(maintenant), horsLigne: true },
    snap: { ...snap, horsListe: [...snap.horsListe, maj] },
    passage,
  }
}

// ---------- stockage local (IndexedDB) ----------
let ouverture: Promise<IDBDatabase> | null = null
function ouvrir(): Promise<IDBDatabase> {
  if (!ouverture) {
    ouverture = new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("miam-service", 1)
      r.onupgradeneeded = () => {
        r.result.createObjectStore("instantanes", { keyPath: "service" })
        r.result.createObjectStore("passages", { keyPath: "id" })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => {
        ouverture = null
        reject(r.error)
      }
    })
  }
  return ouverture
}

async function executer<T>(magasin: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(magasin, mode)
    const r = fn(t.objectStore(magasin))
    t.oncomplete = () => resolve(r.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export const lireInstantane = (service: string): Promise<Instantane | undefined> => executer<Instantane | undefined>("instantanes", "readonly", (s) => s.get(service))
export const ecrireInstantane = async (i: Instantane): Promise<void> => {
  await executer("instantanes", "readwrite", (s) => s.put(i))
}
export const supprimerInstantanes = async (): Promise<void> => {
  await executer("instantanes", "readwrite", (s) => s.clear())
}
export const listerInstantanes = (): Promise<Instantane[]> => executer<Instantane[]>("instantanes", "readonly", (s) => s.getAll())
export const supprimerInstantane = async (service: string): Promise<void> => {
  await executer("instantanes", "readwrite", (s) => s.delete(service))
}
export const ajouterPassage = async (p: Passage): Promise<void> => {
  await executer("passages", "readwrite", (s) => s.put(p))
}
export const listerPassages = (): Promise<Passage[]> => executer<Passage[]>("passages", "readonly", (s) => s.getAll())
export const supprimerPassage = async (id: string): Promise<void> => {
  await executer("passages", "readwrite", (s) => s.delete(id))
}

// Met en cache la page et ses fichiers pour qu'un rechargement sans reseau fonctionne.
export async function prechauffer(): Promise<void> {
  if (!("caches" in window)) return
  const cache = await caches.open(NOM_CACHE)
  const racine = location.origin + "/_next/static/"
  const urls = new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.startsWith(racine)))
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})))
  const u = new URL(location.href)
  const reponse = await fetch(u.origin + u.pathname + u.search, { cache: "no-store", credentials: "same-origin" })
  if (reponse.ok && !reponse.redirected) await cache.put(u.origin + u.pathname + u.search, reponse)
}

export async function viderCache(): Promise<void> {
  if ("caches" in window) await caches.delete(NOM_CACHE)
}