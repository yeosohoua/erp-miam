import { PARAMS_DEFAUT, calculerPaie, itsBrut, partsDe } from "../src/lib/paie-base.ts"

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
const base = { salaireBase: 0, primes: 0, indemniteExoneree: 0, situation: "CELIBATAIRE", enfants: 0, personnesCmu: 1 }
const calc = (o, p = PARAMS_DEFAUT) => calculerPaie({ ...base, ...o }, p)

console.log("Barème de l'ITS (hauts de tranche publiés)")
egal("75 000 -> 0", itsBrut(75_000), 0)
egal("240 000 -> 26 400", itsBrut(240_000), 26_400)
egal("800 000 -> 144 000", itsBrut(800_000), 144_000)
egal("2 400 000 -> 528 000", itsBrut(2_400_000), 528_000)
egal("8 000 000 -> 2 096 000", itsBrut(8_000_000), 2_096_000)
egal("500 000 -> 81 000", itsBrut(500_000), 81_000)

console.log("Parts familiales")
egal("célibataire sans enfant", partsDe("CELIBATAIRE", 0), 1)
egal("marié sans enfant", partsDe("MARIE", 0), 2)
egal("célibataire, 1 enfant", partsDe("CELIBATAIRE", 1), 2)
egal("marié, 1 enfant", partsDe("MARIE", 1), 2.5)
egal("veuf sans enfant", partsDe("VEUF", 0), 1)
egal("veuf, 2 enfants", partsDe("VEUF", 2), 3)
egal("plafond à 5 parts", partsDe("MARIE", 12), 5)

console.log("Bulletin de 150 000 F, célibataire")
const a = calc({ salaireBase: 150_000 })
egal("retraite salarié 9 450", a.retraiteSalarie, 9_450)
egal("CMU salarié 500 (total 9 950)", a.retraiteSalarie + a.cmuSalarie, 9_950)
egal("ITS 12 000", a.its, 12_000)
egal("net 128 050", a.net, 128_050)

console.log("Marié, 2 enfants (3 parts), 500 000 F")
const b = calc({ salaireBase: 500_000, situation: "MARIE", enfants: 2 })
egal("réduction pour charges de famille 22 000", b.ricf, 22_000)
egal("ITS 59 000", b.its, 59_000)
egal("net 409 000 (500 000 - 31 500 - 500 - 59 000)", b.net, 409_000)

console.log("Charges de l'employeur sur 450 000 F")
const c = calc({ salaireBase: 450_000 })
egal("ITS 70 500", c.its, 70_500)
egal("retraite patronale 34 650", c.retraitePatronale, 34_650)
egal("prestations familiales 3 750 (plafond 75 000)", c.pf, 3_750)
egal("accident du travail 1 500 (2 %)", c.at, 1_500)
egal("taxes patronales 12 600 (2,8 %)", c.taxesPatronales, 12_600)
egal("coût employeur 503 563", c.coutEmployeur, 503_563)

console.log("Plafond et plancher")
egal("retraite salarié plafonnée à 212 625", calc({ salaireBase: 5_000_000 }).retraiteSalarie, 212_625)
egal("sous le SMIG : cotisation calculée sur le plancher 75 000", calc({ salaireBase: 60_000 }).retraiteSalarie, 4_725)
egal("brut sous 75 000 : aucun ITS", calc({ salaireBase: 60_000 }).its, 0)

console.log("Réglages")
egal("cotisations CNPS déductibles de la base ITS", calc({ salaireBase: 150_000 }, { ...PARAMS_DEFAUT, cnpsDeductibleIts: true }).its, 10_488)
egal("indemnité exonérée retirée de la base ITS", calc({ salaireBase: 150_000, indemniteExoneree: 30_000 }).its, 7_200)
egal("primes ajoutées au brut", calc({ salaireBase: 100_000, primes: 50_000 }).brut, 150_000)
egal("net jamais négatif ici : ITS plafonné à zéro", calc({ salaireBase: 80_000, situation: "MARIE", enfants: 8 }).its, 0)

console.log("")
console.log("Resultat : " + (total - echecs) + " / " + total + " verifications reussies")
console.log(echecs === 0 ? "=== TESTS PAIE-CALCUL OK ===" : "=== TESTS PAIE-CALCUL ECHEC ===")
process.exit(echecs === 0 ? 0 : 1)