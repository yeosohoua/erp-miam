import assert from "node:assert/strict"
import { enGrammes, nutritionPlat, evaluerRepas, proposerMenus } from "../src/lib/nutrition-base.ts"
import { referencePour, densitePour, REFERENCE } from "../src/lib/nutrition-reference.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(enGrammes(2, "kg"), 2000)
assert.equal(enGrammes(1, "litre", 0.92), 920)
assert.equal(enGrammes(3, "piece"), null)
ok("conversion en grammes")

const riz = { kcal: 360, proteines: 7, glucides: 79, lipides: 0.6, fibres: 1.3 }
const r1 = nutritionPlat([{ quantite: 0.1, unite: "kg", densite: 1, valeurs: riz }], 1)
assert.equal(r1.parPortion.kcal, 360)
assert.equal(r1.manquants, 0)
const r2 = nutritionPlat([{ quantite: 1, unite: "kg", densite: 1, valeurs: riz }, { quantite: 1, unite: "kg", densite: 1, valeurs: null }], 10)
assert.equal(r2.parPortion.kcal, 360)
assert.equal(r2.manquants, 1)
ok("valeurs par portion et ingredients manquants")

assert.ok(referencePour("Riz parfumé"))
assert.ok(referencePour("Tomates fraîches"))
assert.equal(referencePour("Pomme de terre")?.cle, "pomme de terre")
assert.equal(referencePour("Huile de palme")?.cle, "huile palme")
assert.equal(densitePour("Huile végétale"), 0.92)
assert.equal(referencePour("zzz inconnu"), null)
assert.ok(REFERENCE.length >= 29)
ok("table de reference et alias")

const bon = evaluerRepas("LUNCH", { kcal: 700, proteines: 30, glucides: 90, lipides: 20, fibres: 8 })
assert.equal(bon.score, 100)
const faible = evaluerRepas("LUNCH", { kcal: 200, proteines: 5, glucides: 30, lipides: 5, fibres: 1 })
assert.ok(faible.score < 60 && faible.alertes.length >= 2)
assert.equal(evaluerRepas("LUNCH", { kcal: 0, proteines: 0, glucides: 0, lipides: 0, fibres: 0 }).score, 0)
ok("score d'equilibre")

const val = { kcal: 700, proteines: 30, glucides: 90, lipides: 20, fibres: 8 }
const cand = [
  { id: "a", nom: "Plat A", valeurs: val, cout: 500, allergenes: [], antiGaspi: 0 },
  { id: "b", nom: "Plat B", valeurs: val, cout: 600, allergenes: [], antiGaspi: 0 },
  { id: "c", nom: "Plat C", valeurs: val, cout: 300, allergenes: ["GLUTEN"], antiGaspi: 0 },
  { id: "d", nom: "Plat D", valeurs: val, cout: 2000, allergenes: [], antiGaspi: 0 },
]
const p1 = proposerMenus(cand, { service: "LUNCH", dates: ["2026-12-01", "2026-12-02"], budget: 1000, exclus: ["GLUTEN"] })
assert.equal(p1.length, 2)
assert.ok(p1.every((x) => x.platId !== "c" && x.platId !== "d"))
assert.notEqual(p1[0].platId, p1[1].platId)
ok("propositions : budget, allergenes, variete")

const cand2 = cand.slice(0, 2).map((c, i) => ({ ...c, antiGaspi: i === 1 ? 2 : 0 }))
const p2 = proposerMenus(cand2, { service: "LUNCH", dates: ["2026-12-01"], budget: null, exclus: [] })
assert.equal(p2[0].platId, "b")
ok("propositions : priorite anti-gaspillage")

assert.deepEqual(proposerMenus([], { service: "LUNCH", dates: ["2026-12-01"], budget: null, exclus: [] }), [])
ok("aucun candidat")

console.log("=== TESTS NUTRITION CALCUL OK ===")