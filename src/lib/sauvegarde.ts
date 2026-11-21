import "server-only"

import { db } from "@/lib/db"
import { SauvegardeInvalide, exporterTout, restaurerTout, type ClientSql } from "@/lib/sauvegarde-sql"

export const FORMAT_SAUVEGARDE = "erp-miam-sauvegarde"
type Ligne = Record<string, unknown>

export async function exporterV1() {
  const [etablissements, users, userEtablissements, referentiels, inscrits, inscritAllergies, tuteurs, ingredients, ingredientAllergens, plats, platIngredients, menus, menuPlats, reservations, tarifs, transactions, paiementsEnLigne, clients, factures, factureLignes, reglements, relances, auditLogs] =
    await Promise.all([
      db.etablissement.findMany(),
      db.user.findMany(),
      db.userEtablissement.findMany(),
      db.referentiel.findMany(),
      db.inscrit.findMany(),
      db.inscritAllergie.findMany(),
      db.tuteur.findMany(),
      db.ingredient.findMany(),
      db.ingredientAllergen.findMany(),
      db.plat.findMany(),
      db.platIngredient.findMany(),
      db.menu.findMany(),
      db.menuPlat.findMany(),
      db.reservation.findMany(),
      db.tarif.findMany(),
      db.transaction.findMany(),
      db.paiementEnLigne.findMany(),
      db.client.findMany(),
      db.facture.findMany(),
      db.factureLigne.findMany(),
      db.reglement.findMany(),
      db.relance.findMany(),
      db.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    ])
  const [fournisseurs, bonsCommande, bonCommandeLignes, lotsStock, mouvementsStock, consommations, parametresNotifications, notifications, ecrituresCompta, ecritureLignes, cloturesCompta, employesRh, parametresPaie, bulletinsPaie, evenementsCantine, plansProduction, gaspillages, articlesCarte, ventesComptoir, venteLignes] = await Promise.all([
    db.fournisseur.findMany(),
    db.bonCommande.findMany(),
    db.bonCommandeLigne.findMany(),
    db.lot.findMany(),
    db.mouvementStock.findMany(),
    db.consommation.findMany(),
    db.parametresNotification.findMany(),
    db.notification.findMany(),
    db.ecritureCompta.findMany(),
    db.ecritureLigne.findMany(),
    db.clotureCompta.findMany(),
    db.employeRh.findMany(),
    db.parametresPaie.findMany(),
    db.bulletinPaie.findMany(),
    db.evenementCantine.findMany(),
    db.planProduction.findMany(),
    db.gaspillage.findMany(),
    db.articleCarte.findMany(),
    db.venteComptoir.findMany(),
    db.venteLigne.findMany(),
  ])
  return {
    format: FORMAT_SAUVEGARDE,
    version: 1,
    createdAt: new Date().toISOString(),
    tables: { etablissements, users, userEtablissements, referentiels, inscrits, inscritAllergies, tuteurs, ingredients, ingredientAllergens, plats, platIngredients, menus, menuPlats, reservations, tarifs, transactions, paiementsEnLigne, clients, factures, factureLignes, reglements, relances, auditLogs, fournisseurs, bonsCommande, bonCommandeLignes, lots: lotsStock, mouvementsStock, consommations, parametresNotifications, notifications, ecrituresCompta, ecritureLignes, cloturesCompta, employesRh, parametresPaie, bulletinsPaie, evenementsCantine, plansProduction, gaspillages, articlesCarte, ventesComptoir, venteLignes },
  }
}

// optionnel : une sauvegarde ancienne (sans cette table) reste restaurable.
function lignes(tables: Record<string, unknown>, nom: string, champsDates: string[], optionnel = false): Ligne[] {
  const v = tables[nom]
  if (v === undefined && optionnel) return []
  if (!Array.isArray(v)) throw new Error("Table manquante : " + nom)
  return v.map((brut) => {
    if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new Error("Ligne invalide dans " + nom)
    const o: Ligne = { ...(brut as Ligne) }
    for (const c of champsDates) {
      const d = o[c]
      if (typeof d !== "string" || Number.isNaN(Date.parse(d))) throw new Error("Date invalide dans " + nom + "." + c)
      o[c] = new Date(d)
    }
    return o
  })
}

async function lots<T>(rows: T[], ecrire: (lot: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) await ecrire(rows.slice(i, i + 1000))
}

// Remplace toutes les donnees par celles du fichier, en une seule transaction : tout ou rien.
export async function restaurerV1(donnees: unknown): Promise<{ erreur: string } | { lignes: number }> {
  let t
  try {
    const d = donnees as { format?: unknown; version?: unknown; tables?: unknown }
    if (!d || d.format !== FORMAT_SAUVEGARDE || d.version !== 1 || typeof d.tables !== "object" || d.tables === null) {
      return { erreur: "Fichier de sauvegarde invalide : format ou version non reconnus." }
    }
    const tables = d.tables as Record<string, unknown>
    t = {
      etablissements: lignes(tables, "etablissements", ["createdAt", "updatedAt"]),
      users: lignes(tables, "users", ["createdAt", "updatedAt"]),
      userEtablissements: lignes(tables, "userEtablissements", ["createdAt"]),
      referentiels: lignes(tables, "referentiels", ["createdAt"]),
      inscrits: lignes(tables, "inscrits", ["createdAt", "updatedAt"]),
      inscritAllergies: lignes(tables, "inscritAllergies", []),
      tuteurs: lignes(tables, "tuteurs", ["createdAt"]),
      ingredients: lignes(tables, "ingredients", ["createdAt", "updatedAt"], true),
      ingredientAllergens: lignes(tables, "ingredientAllergens", [], true),
      plats: lignes(tables, "plats", ["createdAt", "updatedAt"], true),
      platIngredients: lignes(tables, "platIngredients", [], true),
      menus: lignes(tables, "menus", ["date", "createdAt", "updatedAt"], true),
      menuPlats: lignes(tables, "menuPlats", [], true),
      reservations: lignes(tables, "reservations", ["date", "createdAt", "updatedAt"], true).map((r) => ({ ...r, servedAt: typeof r.servedAt === "string" ? new Date(r.servedAt) : null })),
      tarifs: lignes(tables, "tarifs", [], true),
      transactions: lignes(tables, "transactions", ["createdAt"], true),
      paiementsEnLigne: lignes(tables, "paiementsEnLigne", ["createdAt", "updatedAt"], true).map((r) => ({ ...r, creditedAt: typeof r.creditedAt === "string" ? new Date(r.creditedAt) : null })),
      clients: lignes(tables, "clients", ["createdAt", "updatedAt"], true),
      factures: lignes(tables, "factures", ["createdAt", "updatedAt"], true).map((r) => ({
        ...r,
        emisLe: typeof r.emisLe === "string" ? new Date(r.emisLe) : null,
        echeance: typeof r.echeance === "string" ? new Date(r.echeance) : null,
      })),
      factureLignes: lignes(tables, "factureLignes", [], true),
      reglements: lignes(tables, "reglements", ["createdAt"], true),
      relances: lignes(tables, "relances", ["createdAt"], true),
      fournisseurs: lignes(tables, "fournisseurs", ["createdAt", "updatedAt"], true),
      bonsCommande: lignes(tables, "bonsCommande", ["createdAt", "updatedAt"], true).map((r) => ({ ...r, envoyeLe: typeof r.envoyeLe === "string" ? new Date(r.envoyeLe) : null })),
      bonCommandeLignes: lignes(tables, "bonCommandeLignes", [], true),
      lots: lignes(tables, "lots", ["recuLe"], true).map((r) => ({ ...r, peremption: typeof r.peremption === "string" ? new Date(r.peremption) : null })),
      mouvementsStock: lignes(tables, "mouvementsStock", ["createdAt"], true),
      consommations: lignes(tables, "consommations", ["date", "createdAt"], true),
      parametresNotifications: lignes(tables, "parametresNotifications", [], true),
      notifications: lignes(tables, "notifications", ["createdAt"], true).map((r) => ({ ...r, envoyeLe: typeof r.envoyeLe === "string" ? new Date(r.envoyeLe) : null })),
      ecrituresCompta: lignes(tables, "ecrituresCompta", ["date", "createdAt"], true),
      ecritureLignes: lignes(tables, "ecritureLignes", [], true),
      cloturesCompta: lignes(tables, "cloturesCompta", ["clotureLe"], true),
        employesRh: lignes(tables, "employesRh", ["dateEmbauche", "createdAt", "updatedAt"], true),
        parametresPaie: lignes(tables, "parametresPaie", ["updatedAt"], true),
        evenementsCantine: lignes(tables, "evenementsCantine", ["debut", "fin", "createdAt"], true),
        plansProduction: lignes(tables, "plansProduction", ["date", "updatedAt"], true),
        gaspillages: lignes(tables, "gaspillages", ["date", "createdAt"], true),
        articlesCarte: lignes(tables, "articlesCarte", ["createdAt"], true),
        ventesComptoir: lignes(tables, "ventesComptoir", ["createdAt"], true).map((r) => ({ ...r, annuleeLe: typeof r.annuleeLe === "string" ? new Date(r.annuleeLe) : null })),
        venteLignes: lignes(tables, "venteLignes", [], true),
        bulletinsPaie: lignes(tables, "bulletinsPaie", ["createdAt"], true).map((r) => ({ ...r, valideLe: typeof r.valideLe === "string" ? new Date(r.valideLe) : null })),
      auditLogs: lignes(tables, "auditLogs", ["createdAt"]),
    }
  } catch (e) {
    return { erreur: "Fichier de sauvegarde invalide : " + (e instanceof Error ? e.message : "contenu illisible") + "." }
  }
  if (!t.users.some((u) => u.role === "ADMIN" && u.active === true)) {
    return { erreur: "Fichier de sauvegarde invalide : aucun administrateur actif. Restauration refusée." }
  }

  try {
    await db.$transaction(
      async (tx) => {
        await tx.ecritureLigne.deleteMany()
        await tx.ecritureCompta.deleteMany()
        await tx.clotureCompta.deleteMany()
        await tx.notification.deleteMany()
        await tx.parametresNotification.deleteMany()
        await tx.mouvementStock.deleteMany()
        await tx.lot.deleteMany()
        await tx.consommation.deleteMany()
        await tx.bonCommandeLigne.deleteMany()
        await tx.bonCommande.deleteMany()
        await tx.fournisseur.deleteMany()
        await tx.reglement.deleteMany()
        await tx.relance.deleteMany()
        await tx.factureLigne.deleteMany()
        await tx.facture.deleteMany()
        await tx.client.deleteMany()
        await tx.paiementEnLigne.deleteMany()
        await tx.transaction.deleteMany()
        await tx.tarif.deleteMany()
        await tx.reservation.deleteMany()
        await tx.menuPlat.deleteMany()
        await tx.menu.deleteMany()
        await tx.platIngredient.deleteMany()
        await tx.plat.deleteMany()
        await tx.ingredientAllergen.deleteMany()
        await tx.ingredient.deleteMany()
        await tx.auditLog.deleteMany()
        await tx.inscritAllergie.deleteMany()
        await tx.tuteur.deleteMany()
        await tx.inscrit.deleteMany()
        await tx.referentiel.deleteMany()
        await tx.userEtablissement.deleteMany()
        await tx.user.deleteMany()
        await tx.etablissement.deleteMany()
        await lots(t.etablissements, (lot) => tx.etablissement.createMany({ data: lot as never }))
        await lots(t.ecrituresCompta, (lot) => tx.ecritureCompta.createMany({ data: lot as never }))
        await lots(t.ecritureLignes, (lot) => tx.ecritureLigne.createMany({ data: lot as never }))
        await lots(t.cloturesCompta, (lot) => tx.clotureCompta.createMany({ data: lot as never }))
          await lots(t.employesRh, (lot) => tx.employeRh.createMany({ data: lot as never }))
          await lots(t.parametresPaie, (lot) => tx.parametresPaie.createMany({ data: lot as never }))
          await lots(t.bulletinsPaie, (lot) => tx.bulletinPaie.createMany({ data: lot as never }))
          await lots(t.evenementsCantine, (lot) => tx.evenementCantine.createMany({ data: lot as never }))
          await lots(t.plansProduction, (lot) => tx.planProduction.createMany({ data: lot as never }))
          await lots(t.gaspillages, (lot) => tx.gaspillage.createMany({ data: lot as never }))
          await lots(t.articlesCarte, (lot) => tx.articleCarte.createMany({ data: lot as never }))
          await lots(t.ventesComptoir, (lot) => tx.venteComptoir.createMany({ data: lot as never }))
          await lots(t.venteLignes, (lot) => tx.venteLigne.createMany({ data: lot as never }))
        await lots(t.parametresNotifications, (lot) => tx.parametresNotification.createMany({ data: lot as never }))
        await lots(t.notifications, (lot) => tx.notification.createMany({ data: lot as never }))
        await lots(t.clients, (lot) => tx.client.createMany({ data: lot as never }))
        await lots(t.users, (lot) => tx.user.createMany({ data: lot as never }))
        await lots(t.userEtablissements, (lot) => tx.userEtablissement.createMany({ data: lot as never }))
        await lots(t.referentiels, (lot) => tx.referentiel.createMany({ data: lot as never }))
        await lots(t.inscrits, (lot) => tx.inscrit.createMany({ data: lot as never }))
        await lots(t.inscritAllergies, (lot) => tx.inscritAllergie.createMany({ data: lot as never }))
        await lots(t.tuteurs, (lot) => tx.tuteur.createMany({ data: lot as never }))
        await lots(t.ingredients, (lot) => tx.ingredient.createMany({ data: lot as never }))
        await lots(t.ingredientAllergens, (lot) => tx.ingredientAllergen.createMany({ data: lot as never }))
        await lots(t.fournisseurs, (lot) => tx.fournisseur.createMany({ data: lot as never }))
        await lots(t.bonsCommande, (lot) => tx.bonCommande.createMany({ data: lot as never }))
        await lots(t.bonCommandeLignes, (lot) => tx.bonCommandeLigne.createMany({ data: lot as never }))
        await lots(t.lots, (lot) => tx.lot.createMany({ data: lot as never }))
        await lots(t.mouvementsStock, (lot) => tx.mouvementStock.createMany({ data: lot as never }))
        await lots(t.consommations, (lot) => tx.consommation.createMany({ data: lot as never }))
        await lots(t.plats, (lot) => tx.plat.createMany({ data: lot as never }))
        await lots(t.platIngredients, (lot) => tx.platIngredient.createMany({ data: lot as never }))
        await lots(t.menus, (lot) => tx.menu.createMany({ data: lot as never }))
        await lots(t.menuPlats, (lot) => tx.menuPlat.createMany({ data: lot as never }))
        await lots(t.factures, (lot) => tx.facture.createMany({ data: lot as never }))
        await lots(t.factureLignes, (lot) => tx.factureLigne.createMany({ data: lot as never }))
        await lots(t.reglements, (lot) => tx.reglement.createMany({ data: lot as never }))
        await lots(t.relances, (lot) => tx.relance.createMany({ data: lot as never }))
        await lots(t.reservations, (lot) => tx.reservation.createMany({ data: lot as never }))
        await lots(t.tarifs, (lot) => tx.tarif.createMany({ data: lot as never }))
        await lots(t.transactions, (lot) => tx.transaction.createMany({ data: lot as never }))
        await lots(t.paiementsEnLigne, (lot) => tx.paiementEnLigne.createMany({ data: lot as never }))
        await lots(t.auditLogs, (lot) => tx.auditLog.createMany({ data: lot as never }))
      },
      { timeout: 120_000, maxWait: 10_000 },
    )
  } catch (e) {
    console.error("Restauration en echec", e)
    return { erreur: "Fichier de sauvegarde invalide ou incompatible. Aucune donnée n'a été modifiée." }
  }
  return { lignes: Object.values(t).reduce((n, r) => n + r.length, 0) }
}

// Export complet (version 2) : toutes les tables du schema, images comprises.
export async function exporterSauvegarde() {
  return { format: FORMAT_SAUVEGARDE, version: 2, createdAt: new Date().toISOString(), tables: await exporterTout(db as unknown as ClientSql) }
}

// Accepte les sauvegardes completes (version 2) et les anciennes (version 1).
export async function restaurerSauvegarde(donnees: unknown): Promise<{ erreur: string } | { lignes: number }> {
  const d = donnees as { format?: unknown; version?: unknown; tables?: unknown } | null
  if (d && d.format === FORMAT_SAUVEGARDE && d.version === 2) {
    if (typeof d.tables !== "object" || d.tables === null || Array.isArray(d.tables)) return { erreur: "Fichier de sauvegarde invalide : tables manquantes." }
    try {
      return { lignes: await restaurerTout(db as unknown as ClientSql, d.tables as Record<string, unknown>) }
    } catch (e) {
      if (e instanceof SauvegardeInvalide) return { erreur: "Fichier de sauvegarde invalide : " + e.message + "." }
      console.error("Restauration en echec", e)
      return { erreur: "Fichier de sauvegarde invalide ou incompatible. Aucune donnée n'a été modifiée." }
    }
  }
  return restaurerV1(donnees)
}
