import { decider } from "../src/lib/hors-ligne.ts"

let ok = 0
let total = 0
function verifier(condition, message) {
  total++
  if (!condition) {
    console.log("  ECHEC  " + message)
    process.exit(1)
  }
  ok++
  console.log("  OK     " + message)
}

const base = { etabId: "e", userId: "u", service: "LUNCH", jour: "2026-11-20", genereLe: 0, prix: 600, actif: true, devise: "XOF", menuPublie: true, horsListe: [] }
const item = (extra) => ({ id: "i1", nom: "Kone Awa", matricule: "M1", badge: "B1", groupe: null, regime: null, allergies: [], solde: 400, servi: false, heure: null, ...extra })
const t = Date.now()

const d1 = decider({ ...base, items: [item({ prix: 300 })] }, "M1", false, t)
verifier(d1.resultat.statut === "SERVI", "eleve aide (300) avec 400 de solde : servi")
verifier(d1.snap.items[0].solde === 100, "solde restant 100 apres un debit de 300")

const d2 = decider({ ...base, items: [item({ prix: 300, solde: 250 })] }, "M1", false, t)
verifier(d2.resultat.statut === "SOLDE_INSUFFISANT" && d2.resultat.message.includes("300"), "solde 250 pour un repas aide a 300 : refuse, message au bon prix")

const d3 = decider({ ...base, items: [item({ prix: 0, solde: 0 })] }, "M1", false, t)
verifier(d3.resultat.statut === "SERVI" && d3.snap.items[0].solde === 0 && !d3.resultat.paiement, "gratuite : servi, aucun debit")

const d4 = decider({ ...base, items: [item({})] }, "M1", false, t)
verifier(d4.resultat.statut === "SOLDE_INSUFFISANT", "sans prix individuel : prix du service (600), solde 400 insuffisant")

const d5 = decider({ ...base, items: [item({ prix: 300 })] }, "B1", false, t)
verifier(d5.resultat.statut === "SERVI", "le badge fonctionne aussi")

console.log("")
console.log("Resultat : " + ok + " / " + total)
console.log("=== TESTS HORS-LIGNE AIDES OK ===")