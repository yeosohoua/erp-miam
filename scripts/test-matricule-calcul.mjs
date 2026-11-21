import { matriculeValide } from "../src/lib/inscrits.ts"
import { prefixeEtab, suivantMatricule } from "../src/lib/inscrits-matricule-calcul.ts"

const validite = [
  ["E0001", true],
  ["A", true],
  ["26GSL0053", true],
  ["ZZ-01", true],
  ["A".repeat(20), true],
  ["", false],
  ["A".repeat(21), false],
  ["-A", false],
  ["A.B", false],
  ["é0001", false],
  ["A 001", false],
]
const generation = [
  [prefixeEtab("GSL-COCODY"), "GSL"],
  [prefixeEtab("ZZ-UX"), "ZZ"],
  [prefixeEtab("a.b_c-x"), "ABC"],
  [suivantMatricule([], 2026, "GSL"), "26GSL0001"],
  [suivantMatricule(["26GSL0053", "26GSL0054", "25GSL0099", "E0001"], 2026, "GSL"), "26GSL0055"],
  [suivantMatricule(["26GSL9999"], 2026, "GSL"), "26GSL9999"],
  [suivantMatricule([], 2027, ""), "27E0001"],
]
let ko = 0
for (const [valeur, attendu] of validite) {
  const ok = matriculeValide(valeur) === attendu
  if (!ok) ko += 1
  console.log("  " + (ok ? "OK    " : "ECHEC ") + "valide " + JSON.stringify(valeur) + " -> " + attendu)
}
for (const [obtenu, attendu] of generation) {
  const ok = obtenu === attendu
  if (!ok) ko += 1
  console.log("  " + (ok ? "OK    " : "ECHEC ") + "genere " + JSON.stringify(obtenu) + " attendu " + JSON.stringify(attendu))
}
const total = validite.length + generation.length
console.log("Resultat : " + (total - ko) + " / " + total + " cas reussis")
console.log(ko === 0 ? "=== TESTS MATRICULE OK ===" : "=== TESTS MATRICULE ECHEC ===")
process.exit(ko === 0 ? 0 : 1)