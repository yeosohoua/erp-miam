export const CODES_DEMO = ["GSL-COCODY", "CE-PLATEAU"]

// Supprime uniquement les etablissements de demonstration (tout ce qui leur est rattache part en cascade)
// et les utilisateurs qui ne sont lies a aucun autre etablissement. Les administrateurs sont toujours conserves.
export async function supprimerDemo(db, { confirmer }) {
  const etabs = await db.etablissement.findMany({ where: { code: { in: CODES_DEMO } }, select: { id: true, code: true } })
  const ids = etabs.map((e) => e.id)
  const rapport = { etablissements: etabs.map((e) => e.code), comptes: {}, utilisateurs: [], conserves: [] }
  if (ids.length === 0) return rapport
  const par = { etablissementId: { in: ids } }
  rapport.comptes = {
    inscrits: await db.inscrit.count({ where: par }),
    reservations: await db.reservation.count({ where: par }),
    transactions: await db.transaction.count({ where: par }),
    consommations: await db.consommation.count({ where: par }),
    plats: await db.plat.count({ where: par }),
    ingredients: await db.ingredient.count({ where: par }),
    lots: await db.lot.count({ where: par }),
    fournisseurs: await db.fournisseur.count({ where: par }),
    bonsCommande: await db.bonCommande.count({ where: par }),
    menus: await db.menu.count({ where: par }),
    gaspillages: await db.gaspillage.count({ where: par }),
    articlesCarte: await db.articleCarte.count({ where: par }),
  }
  const liens = await db.userEtablissement.findMany({ where: par, select: { userId: true } })
  const candidats = [...new Set(liens.map((l) => l.userId))]
  const users = await db.user.findMany({ where: { id: { in: candidats }, role: { not: "ADMIN" } }, select: { id: true, email: true, role: true, etablissements: { select: { etablissementId: true } } } })
  const aSupprimer = users.filter((u) => u.etablissements.every((l) => ids.includes(l.etablissementId)))
  rapport.utilisateurs = aSupprimer.map((u) => `${u.role} ${u.email}`)
  rapport.conserves = users.filter((u) => !aSupprimer.includes(u)).map((u) => `${u.role} ${u.email} (lie a un autre etablissement)`)
  if (confirmer) {
    await db.$transaction([
      db.user.deleteMany({ where: { id: { in: aSupprimer.map((u) => u.id) } } }),
      db.etablissement.deleteMany({ where: { id: { in: ids } } }),
    ])
  }
  return rapport
}