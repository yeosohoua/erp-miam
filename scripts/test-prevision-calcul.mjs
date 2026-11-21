import { aCommander, aProduireRecommande, besoinsIngredients, ecartPct, prevoir } from "../src/lib/prevision-base.ts"

let echecs = 0
let total = 0
function egal(nom, obtenu, attendu) {
  total++
  if (obtenu === attendu) console.log("  OK     " + nom)
  else {
    echecs++
    console.log("  ECHEC  " + nom + " : obtenu " + obtenu + ", attendu " + attendu)
  }
}
const CIBLE = "2026-12-14"
const lundis = (valeurs, reserves = 0) => valeurs.map(([date, servis]) => ({ date, servis, reserves }))
const quatre = lundis([["2026-11-30", 100], ["2026-11-23", 100], ["2026-11-16", 100], ["2026-11-09", 100]], 110)

console.log("Moyenne pondérée des mêmes jours de la semaine")
const a = prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: lundis([["2026-11-30", 120], ["2026-11-23", 100], ["2026-11-16", 80]]), reserves: 0, evenements: [] })
egal("prévu 103", a.prevu, 103)
egal("intervalle bas 77", a.bas, 77)
egal("intervalle haut 129", a.haut, 129)
egal("confiance moyenne", a.confiance, "MOYENNE")
egal("trois observations", a.observations, 3)
const b = prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: [...lundis([["2026-11-30", 120], ["2026-11-23", 100], ["2026-11-16", 80]]), { date: "2026-11-24", servis: 10, reserves: 0 }], reserves: 0, evenements: [] })
egal("un autre jour de la semaine est ignoré", b.prevu, 103)

console.log("Réservations et taux de présence")
const c = prevoir({ cible: CIBLE, aujourdhui: "2026-12-12", historique: quatre, reserves: 120, evenements: [] })
egal("prévu 105 à deux jours (60 % réservations)", c.prevu, 105)
egal("taux de présence 91 %", Math.round(c.tauxPresence * 100), 91)
egal("intervalle 100 à 110", c.bas + "-" + c.haut, "100-110")

console.log("Calendrier")
egal("jour férié : prévu 0", prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: quatre, reserves: 0, evenements: [{ type: "FERIE", debut: CIBLE, fin: CIBLE, impactPct: -100, libelle: "Férié" }] }).prevu, 0)
const d = prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: quatre, reserves: 0, evenements: [{ type: "EVENEMENT", debut: CIBLE, fin: CIBLE, impactPct: 20, libelle: "Fête" }] })
egal("événement +20 % : prévu 120", d.prevu, 120)
egal("facteur affiché", d.facteurs.length, 1)
const e = prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: lundis([["2026-11-30", 100], ["2026-11-23", 20], ["2026-11-16", 100], ["2026-11-09", 100]]), reserves: 0, evenements: [{ type: "VACANCES", debut: "2026-11-23", fin: "2026-11-23", impactPct: -80, libelle: "Vacances" }] })
egal("jour de vacances exclu de l'historique", e.prevu, 100)
egal("trois observations retenues", e.observations, 3)

console.log("Peu de données")
const f = prevoir({ cible: CIBLE, aujourdhui: "2026-12-12", historique: [], reserves: 50, evenements: [] })
egal("sans historique : 90 % des réservations", f.prevu, 45)
egal("confiance faible", f.confiance, "FAIBLE")
egal("sans rien : pas de prévision", prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: [], reserves: 0, evenements: [] }).prevu, null)
const g = prevoir({ cible: CIBLE, aujourdhui: "2026-11-20", historique: lundis([["2026-11-30", 100], ["2026-11-23", 100]]), reserves: 0, evenements: [] })
egal("deux observations : marge de 20 %", g.bas + "-" + g.haut, "80-120")

console.log("Quantités à produire et à commander")
egal("production recommandée avec 5 % de marge", aProduireRecommande(103, 5), 109)
egal("production sans marge", aProduireRecommande(100, 0), 100)
egal("écart de prévision 10 %", ecartPct(90, 100), 10)
egal("écart sans repas servi", ecartPct(5, 0), null)
const besoins = besoinsIngredients([{ portions: 4, lignes: [{ ingredientId: "riz", quantite: 2 }, { ingredientId: "oignon", quantite: 1 }] }, { portions: 2, lignes: [{ ingredientId: "riz", quantite: 0.5 }] }], 100)
egal("riz nécessaire 75", besoins.get("riz"), 75)
egal("oignon nécessaire 25", besoins.get("oignon"), 25)
const lignes = aCommander({ besoins, stock: new Map([["riz", 30], ["oignon", 100]]), seuil: new Map([["riz", 10]]), enCommande: new Map([["riz", 20]]) })
egal("riz à commander : 75 + 10 - 30 - 20 = 35", lignes.find((l) => l.ingredientId === "riz").manque, 35)
egal("oignon couvert par le stock", lignes.find((l) => l.ingredientId === "oignon").manque, 0)

console.log("")
console.log("Resultat : " + (total - echecs) + " / " + total + " verifications reussies")
console.log(echecs === 0 ? "=== TESTS PREVISION-CALCUL OK ===" : "=== TESTS PREVISION-CALCUL ECHEC ===")
process.exit(echecs === 0 ? 0 : 1)