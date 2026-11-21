import assert from "node:assert/strict"
import { BORNES_DEFAUT, ajouterJoursIso, bilanReleves, debutSemaine, ecartTemperature, graviteEcart, releveConforme, resumerRappel, tacheFaite } from "../src/lib/haccp-base.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(releveConforme(3, 0, 4), true)
assert.equal(releveConforme(4, 0, 4), true)
assert.equal(releveConforme(4.1, 0, 4), false)
assert.equal(releveConforme(-17, -25, -18), false)
assert.equal(releveConforme(70, 63, 90), true)
assert.deepEqual(BORNES_DEFAUT.CONGELATEUR, { min: -25, max: -18 })
ok("conformite des temperatures et bornes par defaut")

assert.equal(ecartTemperature(6.5, 0, 4), 2.5)
assert.equal(ecartTemperature(-15, -25, -18), 3)
assert.equal(ecartTemperature(2, 0, 4), 0)
assert.equal(graviteEcart(1.5), "MINEURE")
assert.equal(graviteEcart(2), "MINEURE")
assert.equal(graviteEcart(2.5), "MAJEURE")
assert.equal(graviteEcart(5), "MAJEURE")
assert.equal(graviteEcart(5.1), "CRITIQUE")
ok("ecart et gravite")

assert.equal(ajouterJoursIso("2026-11-20", 5), "2026-11-25")
assert.equal(ajouterJoursIso("2026-12-29", 5), "2027-01-03")
assert.equal(debutSemaine("2026-11-20"), "2026-11-16")
assert.equal(debutSemaine("2026-11-22"), "2026-11-16")
assert.equal(debutSemaine("2026-11-16"), "2026-11-16")
ok("dates et debut de semaine")

assert.equal(tacheFaite("QUOTIDIENNE", "2026-11-20", ["2026-11-19"]), false)
assert.equal(tacheFaite("QUOTIDIENNE", "2026-11-20", ["2026-11-19", "2026-11-20"]), true)
assert.equal(tacheFaite("HEBDOMADAIRE", "2026-11-20", ["2026-11-13"]), false)
assert.equal(tacheFaite("HEBDOMADAIRE", "2026-11-20", ["2026-11-17"]), true)
ok("taches dues : quotidienne et hebdomadaire")

assert.deepEqual(bilanReleves([]), { total: 0, conformes: 0, taux: null })
assert.deepEqual(bilanReleves([{ conforme: true }, { conforme: true }, { conforme: false }]), { total: 3, conformes: 2, taux: 67 })
const r = resumerRappel([{ date: "2026-11-18", service: "LUNCH", repas: 120 }, { date: "2026-11-16", service: "LUNCH", repas: 100 }])
assert.deepEqual(r, { nbServices: 2, repas: 220, premier: "2026-11-16", dernier: "2026-11-18" })
assert.deepEqual(resumerRappel([]), { nbServices: 0, repas: 0, premier: null, dernier: null })
ok("bilan des releves et resume de rappel")

console.log("=== TESTS HACCP CALCUL OK ===")