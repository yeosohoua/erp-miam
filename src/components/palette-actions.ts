"use server"

import { db } from "@/lib/db"
import { contexteEtablissement } from "@/lib/etablissement"
import { ACHATS_LECTURE, INSCRITS_LECTURE, MENUS_LECTURE, STOCK_LECTURE, hasRole } from "@/lib/permissions"
import { getSession } from "@/lib/session"

export type ResultatRecherche = { cle: string; groupe: string; titre: string; detail: string; url: string }

const MAX = 5

export async function rechercherPalette(requete: string): Promise<ResultatRecherche[]> {
  const q = String(requete ?? "").trim().slice(0, 60)
  if (q.length < 2) return []
  const session = await getSession()
  if (!session) return []
  const { courant } = await contexteEtablissement()
  if (!courant) return []
  const etab = courant.id
  const contient = { contains: q, mode: "insensitive" as const }
  const sorties: ResultatRecherche[] = []

  if (hasRole(session.role, INSCRITS_LECTURE)) {
    const rows = await db.inscrit.findMany({
      where: { etablissementId: etab, OR: [{ firstName: contient }, { lastName: contient }, { matricule: contient }] },
      orderBy: { lastName: "asc" },
      take: MAX,
      select: { id: true, firstName: true, lastName: true, matricule: true },
    })
    for (const r of rows) sorties.push({ cle: "i" + r.id, groupe: "Inscrits", titre: `${r.lastName} ${r.firstName}`, detail: r.matricule, url: "/inscrits" })
  }
  if (hasRole(session.role, MENUS_LECTURE)) {
    const rows = await db.plat.findMany({ where: { etablissementId: etab, name: contient }, orderBy: { name: "asc" }, take: MAX, select: { id: true, name: true } })
    for (const r of rows) sorties.push({ cle: "p" + r.id, groupe: "Plats", titre: r.name, detail: "Menus et recettes", url: "/menus" })
  }
  if (hasRole(session.role, STOCK_LECTURE)) {
    const rows = await db.ingredient.findMany({ where: { etablissementId: etab, name: contient }, orderBy: { name: "asc" }, take: MAX, select: { id: true, name: true, unit: true } })
    for (const r of rows) sorties.push({ cle: "g" + r.id, groupe: "Ingrédients", titre: r.name, detail: r.unit, url: "/stock" })
  }
  if (hasRole(session.role, ACHATS_LECTURE)) {
    const rows = await db.fournisseur.findMany({ where: { etablissementId: etab, name: contient }, orderBy: { name: "asc" }, take: MAX, select: { id: true, name: true, phone: true } })
    for (const r of rows) sorties.push({ cle: "f" + r.id, groupe: "Fournisseurs", titre: r.name, detail: r.phone ?? "Approvisionnement", url: "/achats" })
  }
  return sorties
}