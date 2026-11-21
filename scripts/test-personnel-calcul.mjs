import { acquisDixiemes, formaterJours, joursAvant, joursOuvrables, moisCompletes, soldeConges, statutCertification } from "../src/lib/rh-avance-base.ts"

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

verifier(joursOuvrables("2026-11-16", "2026-11-21") === 6, "lundi au samedi : 6 jours ouvrables")
verifier(joursOuvrables("2026-11-16", "2026-11-23") === 7, "lundi a lundi suivant : 7 jours (un dimanche exclu)")
verifier(joursOuvrables("2026-11-22", "2026-11-22") === 0, "un dimanche seul : 0 jour")
verifier(joursOuvrables("2026-11-21", "2026-11-16") === 0 && joursOuvrables("2026-02-30", "2026-03-02") === 0, "periode inversee ou date impossible : 0")
verifier(moisCompletes("2025-11-20", "2026-11-20") === 12 && moisCompletes("2025-11-21", "2026-11-20") === 11, "mois complets d'anciennete")
verifier(moisCompletes("2026-01-31", "2026-02-28") === 0 && moisCompletes("2026-11-21", "2026-11-20") === 0, "mois incomplet ou embauche future : 0")
verifier(acquisDixiemes("2025-11-20", "2026-11-20") === 264 && formaterJours(264) === "26,4", "12 mois : 26,4 jours acquis")
const s = soldeConges("2025-11-20", "2026-11-20", [
  { type: "ANNUEL", statut: "APPROUVE", jours: 6 },
  { type: "ANNUEL", statut: "DEMANDE", jours: 4 },
  { type: "ANNUEL", statut: "REFUSE", jours: 9 },
  { type: "MALADIE", statut: "APPROUVE", jours: 5 },
])
verifier(s.pris === 60 && s.enAttente === 40 && s.disponible === 164, "solde : seul l'annuel compte, les demandes reservent, les refus non")
verifier(statutCertification("2026-11-19", "2026-11-20") === "EXPIREE", "expiree la veille")
verifier(statutCertification("2026-11-20", "2026-11-20") === "BIENTOT", "expire aujourd'hui : encore valable, alerte")
verifier(statutCertification("2027-01-19", "2026-11-20") === "BIENTOT" && statutCertification("2027-01-20", "2026-11-20") === "VALIDE", "seuil d'alerte de 60 jours")
verifier(joursAvant("2026-12-20", "2026-11-20") === 30, "jours avant expiration")
console.log("")
console.log("Resultat : " + ok + " / " + total)
console.log("=== TESTS PERSONNEL CALCUL OK ===")