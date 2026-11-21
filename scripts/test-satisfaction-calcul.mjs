import { formaterMoyenne, noteValide, notesParPlat, statsAvis } from "../src/lib/satisfaction-base.ts"

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

verifier(noteValide(1) && noteValide(5) && !noteValide(0) && !noteValide(6) && !noteValide(3.5), "notes valides : entiers de 1 a 5")
const s = statsAvis([5, 4, 3, 1])
verifier(s.nombre === 4 && s.moyenne10 === 33 && s.satisfaits === 50, "moyenne 3,3 et 50 % de satisfaits")
verifier(formaterMoyenne(33) === "3,3" && formaterMoyenne(45) === "4,5" && formaterMoyenne(30) === "3,0", "format de la moyenne")
const v = statsAvis([])
verifier(v.nombre === 0 && v.moyenne10 === 0 && v.satisfaits === 0, "aucun avis : zeros")
const p = notesParPlat([
  { platNom: "Riz sauce graine", note: 5 },
  { platNom: "Riz sauce graine", note: 4 },
  { platNom: "Attieke poisson", note: 2 },
  { platNom: null, note: 1 },
  { platNom: "Foutou banane", note: 5 },
])
verifier(p.length === 3 && p[0].plat === "Foutou banane" && p[1].plat === "Riz sauce graine" && p[1].moyenne10 === 45 && p[2].plat === "Attieke poisson", "classement des plats (avis sans plat ignores)")
console.log("")
console.log("Resultat : " + ok + " / " + total)
console.log("=== TESTS SATISFACTION CALCUL OK ===")