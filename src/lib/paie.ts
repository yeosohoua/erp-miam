import "server-only"

import { db } from "@/lib/db"
import { PARAMS_DEFAUT, calculerPaie, type ParamsPaie } from "@/lib/paie-base"

// Erreur "metier" : son message est affichable.
export class ErreurPaie extends Error {}

export async function chargerParams(etabId: string): Promise<ParamsPaie> {
  const p = await db.parametresPaie.findUnique({ where: { etablissementId: etabId } })
  if (!p) return PARAMS_DEFAUT
  return {
    retraiteSalarieBp: p.retraiteSalarieBp,
    retraitePatronalBp: p.retraitePatronalBp,
    pfBp: p.pfBp,
    materniteBp: p.materniteBp,
    atBp: p.atBp,
    plafondRetraite: p.plafondRetraite,
    plafondAutres: p.plafondAutres,
    plancher: p.plancher,
    cmuSalarie: p.cmuSalarie,
    cmuPatronale: p.cmuPatronale,
    contributionBp: p.contributionBp,
    apprentissageBp: p.apprentissageBp,
    tfpcBp: p.tfpcBp,
    ricfDemiPart: p.ricfDemiPart,
    cnpsDeductibleIts: p.cnpsDeductibleIts,
  }
}

const dernierJour = (periode: string): string => {
  const [an, mois] = periode.split("-").map(Number)
  return new Date(Date.UTC(an, mois, 0)).toISOString().slice(0, 10)
}

// Cree ou recalcule les brouillons du mois pour les employes actifs deja embauches. Un bulletin valide n'est jamais touche.
export async function genererBulletins(o: { etabId: string; periode: string; userEmail: string }): Promise<{ crees: number; recalcules: number; valides: number }> {
  const params = await chargerParams(o.etabId)
  return db.$transaction(
    async (tx) => {
      const employes = await tx.employeRh.findMany({ where: { etablissementId: o.etabId, actif: true, dateEmbauche: { lte: new Date(dernierJour(o.periode) + "T00:00:00.000Z") } }, orderBy: { matricule: "asc" } })
      const existants = await tx.bulletinPaie.findMany({ where: { etablissementId: o.etabId, periode: o.periode }, select: { id: true, employeId: true, statut: true } })
      const parEmploye = new Map(existants.map((b) => [b.employeId, b]))
      let crees = 0
      let recalcules = 0
      let valides = 0
      for (const e of employes) {
        const r = calculerPaie({ salaireBase: e.salaireBase, primes: e.primes, indemniteExoneree: e.indemniteExoneree, situation: e.situation, enfants: e.enfants, personnesCmu: e.personnesCmu }, params)
        const donnees = {
          brut: r.brut,
          partsX2: r.partsX2,
          baseIts: r.baseIts,
          its: r.its,
          retraiteSalarie: r.retraiteSalarie,
          cmuSalarie: r.cmuSalarie,
          net: r.net,
          retraitePatronale: r.retraitePatronale,
          pf: r.pf,
          maternite: r.maternite,
          at: r.at,
          cmuPatronale: r.cmuPatronale,
          taxesPatronales: r.taxesPatronales,
          coutEmployeur: r.coutEmployeur,
        }
        const ancien = parEmploye.get(e.id)
        if (!ancien) {
          await tx.bulletinPaie.create({ data: { etablissementId: o.etabId, employeId: e.id, periode: o.periode, createdBy: o.userEmail, ...donnees } })
          crees += 1
        } else if (ancien.statut === "DRAFT") {
          await tx.bulletinPaie.update({ where: { id: ancien.id }, data: donnees })
          recalcules += 1
        } else {
          valides += 1
        }
      }
      return { crees, recalcules, valides }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )
}

// Valide tous les brouillons du mois : ils deviennent definitifs et comptabilisables.
export async function validerPeriode(o: { etabId: string; periode: string }): Promise<number> {
  return db.$transaction(
    async (tx) => {
      const brouillons = await tx.bulletinPaie.findMany({ where: { etablissementId: o.etabId, periode: o.periode, statut: "DRAFT" }, select: { id: true, net: true, employe: { select: { matricule: true } } } })
      if (brouillons.length === 0) throw new ErreurPaie("Aucun bulletin en brouillon pour cette période.")
      const negatif = brouillons.find((b) => b.net <= 0)
      if (negatif) throw new ErreurPaie("Net nul ou négatif pour " + negatif.employe.matricule + " : corrigez le salaire ou les paramètres, puis régénérez.")
      const r = await tx.bulletinPaie.updateMany({ where: { id: { in: brouillons.map((b) => b.id) }, statut: "DRAFT" }, data: { statut: "VALIDATED", valideLe: new Date() } })
      return r.count
    },
    { timeout: 60_000, maxWait: 10_000 },
  )
}