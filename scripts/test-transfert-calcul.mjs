import assert from "node:assert/strict"
import { coutMoyenPondere, noteSortie, referenceTransfert, regrouperParLot, STATUTS_TRANSFERT } from "../src/lib/transfert-base.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(coutMoyenPondere([{ quantite: 40, prix: 800 }, { quantite: 10, prix: 900 }]), 820)
assert.equal(coutMoyenPondere([{ quantite: 5, prix: 1500 }]), 1500)
assert.equal(coutMoyenPondere([]), 0)
assert.equal(coutMoyenPondere([{ quantite: 3, prix: 100 }, { quantite: 3, prix: 101 }]), 100.5)
ok("cout moyen pondere par les quantites sorties")

assert.equal(referenceTransfert("GSL-COCODY", 12), "TR-GSL-COCODY-12")
assert.equal(noteSortie("GSL-COCODY", 12), "Transfert GSL-COCODY-12")
ok("reference et note de sortie")

const m = regrouperParLot([{ lotId: "a", quantite: 10.5 }, { lotId: "b", quantite: 2 }, { lotId: "a", quantite: 0.25 }, { lotId: null, quantite: 1 }])
assert.equal(m.get("a"), 10.75)
assert.equal(m.get("b"), 2)
assert.equal(m.get(null), 1)
assert.equal(m.size, 3)
ok("regroupement par lot")

assert.equal(STATUTS_TRANSFERT.RECU, "Reçu")
ok("libelles de statut")

console.log("=== TESTS TRANSFERT CALCUL OK ===")