import assert from "node:assert/strict"
import { KPIS, definitionKpi, formaterValeur, statutObjectif, trierAlertes } from "../src/lib/pilotage-base.ts"
import { analyserCle, creerCle, hacher, verifierCle } from "../src/lib/api-cle.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(new Set(KPIS.map((k) => k.id)).size, KPIS.length)
assert.equal(definitionKpi("nc_ouvertes")?.sens, "MIN")
assert.equal(definitionKpi("inconnu"), null)
ok("indicateurs : identifiants uniques")

assert.equal(statutObjectif(1200, 1000, "MAX"), "ATTEINT")
assert.equal(statutObjectif(950, 1000, "MAX"), "PROCHE")
assert.equal(statutObjectif(800, 1000, "MAX"), "ECART")
assert.equal(statutObjectif(90, 100, "MIN"), "ATTEINT")
assert.equal(statutObjectif(105, 100, "MIN"), "PROCHE")
assert.equal(statutObjectif(130, 100, "MIN"), "ECART")
assert.equal(statutObjectif(0, 0, "MIN"), "ATTEINT")
assert.equal(statutObjectif(1, 0, "MIN"), "ECART")
assert.equal(statutObjectif(null, 10, "MAX"), "SANS_DONNEE")
ok("statut des objectifs (hausse et baisse)")

assert.equal(formaterValeur(null, 0, "%"), "—")
assert.ok(formaterValeur(4.5, 1, "/ 5").includes("4,5"))
ok("formatage")

const t = trierAlertes([
  { code: "a", gravite: "INFO", titre: "B", detail: "", lien: "/" },
  { code: "b", gravite: "CRITIQUE", titre: "Z", detail: "", lien: "/" },
  { code: "c", gravite: "IMPORTANT", titre: "A", detail: "", lien: "/" },
  { code: "d", gravite: "INFO", titre: "A", detail: "", lien: "/" },
])
assert.deepEqual(t.map((x) => x.code), ["b", "c", "d", "a"])
ok("tri des alertes par gravite")

const c = creerCle()
assert.match(c.cle, /^miam_[0-9a-f]{8}_[0-9a-f]{32}$/)
assert.equal(c.hash, hacher(c.cle))
assert.equal(c.hash.length, 64)
assert.equal(analyserCle(c.cle)?.prefixe, c.prefixe)
assert.equal(analyserCle("miam_zz"), null)
assert.equal(analyserCle(c.cle + "x"), null)
assert.equal(verifierCle(c.cle, c.hash), true)
assert.equal(verifierCle(c.cle + "0", c.hash), false)
assert.equal(verifierCle(c.cle, "abcd"), false)
assert.notEqual(creerCle().cle, c.cle)
assert.ok(!c.hash.includes(c.cle))
ok("cles d'API : format, empreinte, verification, unicite")

console.log("=== TESTS PILOTAGE CALCUL OK ===")