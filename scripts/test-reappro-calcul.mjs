import assert from "node:assert/strict"
import { NOTE_REAPPRO, grouperParFournisseur, quantiteACommander } from "../src/lib/reappro-base.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(quantiteACommander({ stock: 20, enCommande: 0, cible: 100 }), 80)
assert.equal(quantiteACommander({ stock: 5, enCommande: 6, cible: 30 }), 19)
assert.equal(quantiteACommander({ stock: 50, enCommande: 0, cible: 40 }), 0)
assert.equal(quantiteACommander({ stock: 10, enCommande: 30, cible: 30 }), 0)
assert.equal(quantiteACommander({ stock: 0.1, enCommande: 0.2, cible: 1 }), 0.7)
assert.equal(quantiteACommander({ stock: 0, enCommande: 0, cible: 0 }), 0)
ok("quantite a commander : stock, commandes en cours, cible, arrondi")

const g = grouperParFournisseur([
  { fournisseurId: "f1", nom: "a" },
  { fournisseurId: null, nom: "b" },
  { fournisseurId: "f2", nom: "c" },
  { fournisseurId: "f1", nom: "d" },
])
assert.equal(g.groupes.size, 2)
assert.deepEqual(g.groupes.get("f1").map((x) => x.nom), ["a", "d"])
assert.deepEqual(g.sansFournisseur.map((x) => x.nom), ["b"])
ok("regroupement par fournisseur et ingredients sans fournisseur")

assert.ok(NOTE_REAPPRO.startsWith("Réapprovisionnement"))
ok("note des bons automatiques")

console.log("=== TESTS REAPPRO CALCUL OK ===")