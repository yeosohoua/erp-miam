import { erreur, json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, dateValide, versDate, versIso } from "@/lib/menus"
import { choisirFiche, reserverRepas } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"

export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const url = new URL(req.url)
  const du = url.searchParams.get("du") ?? aujourdhui()
  if (!dateValide(du)) return erreur(400, "Date de début invalide : format AAAA-MM-JJ attendu.")
  const au = url.searchParams.get("au") ?? ajouterJours(du, 30)
  if (!dateValide(au) || au < du || au > ajouterJours(du, 92)) return erreur(400, "Période invalide (92 jours maximum).")
  const f = await choisirFiche(a, url.searchParams.get("inscritId"))
  if (f instanceof Response) return f
  const liste = await db.reservation.findMany({
    where: { inscritId: f.id, date: { gte: versDate(du), lte: versDate(au) } },
    orderBy: [{ date: "asc" }, { service: "asc" }],
    select: { id: true, date: true, service: true, statut: true, servedAt: true },
  })
  return json({ inscritId: f.id, reservations: liste.map((r) => ({ id: r.id, date: versIso(r.date), service: r.service, statut: String(r.statut), servi: r.servedAt !== null })) })
}

export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  let corps: { inscritId?: unknown; date?: unknown; service?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const f = await choisirFiche(a, typeof corps.inscritId === "string" ? corps.inscritId : null)
  if (f instanceof Response) return f
  const r = await reserverRepas(f, a, typeof corps.date === "string" ? corps.date : "", typeof corps.service === "string" ? corps.service : "")
  if ("erreur" in r) return erreur(r.status, r.erreur)
  return json({ ok: r.ok })
}