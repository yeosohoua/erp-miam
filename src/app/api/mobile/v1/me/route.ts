import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { versIso } from "@/lib/menus"
import { authentifierMobile } from "@/lib/mobile-auth"
import { fichesAccessibles } from "@/lib/mobile-acces"

// Profil de la personne connectee : parent (enfants), eleve (sa fiche) ou employe (poste, conges, pointages).
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const compte = await db.user.findUnique({ where: { id: a.userId }, select: { imageId: true } })
  const base = { role: a.role, name: a.name, photo: compte?.imageId ? "/api/mobile/v1/images/" + compte.imageId : null }
  if (a.role === "PARENT" || a.role === "ELEVE") {
    const fiches = await fichesAccessibles(a)
    return json({ ...base, inscrits: fiches.map((f) => ({ id: f.id, matricule: f.matricule, nom: f.nom, groupe: f.groupe, statut: f.statut, solde: f.etab.prepaye ? f.solde : null, devise: f.etab.currency, etablissement: f.etab.name })) })
  }
  if (a.role === "EMPLOYE") {
    const c = await db.codeAcces.findUnique({ where: { userId: a.userId }, include: { employe: true, etablissement: { select: { name: true } } } })
    if (!c || !c.employe) return json({ ...base, employe: null })
    const [conges, pointages] = await Promise.all([
      db.conge.findMany({ where: { employeId: c.employe.id }, orderBy: { debut: "desc" }, take: 5 }),
      db.pointage.findMany({ where: { employeId: c.employe.id }, orderBy: { date: "desc" }, take: 7 }),
    ])
    return json({
      ...base,
      employe: { matricule: c.employe.matricule, poste: c.employe.poste, dateEmbauche: versIso(c.employe.dateEmbauche), etablissement: c.etablissement.name },
      conges: conges.map((x) => ({ type: String(x.type), debut: versIso(x.debut), fin: versIso(x.fin), jours: x.jours, statut: String(x.statut) })),
      pointages: pointages.map((p) => ({ date: versIso(p.date), statut: String(p.statut), minutesRetard: p.minutesRetard })),
    })
  }
  return json({ ...base })
}