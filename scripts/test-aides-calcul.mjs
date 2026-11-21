import { TYPES_AIDE, aideActiveLe, coutEstime, dateIsoValide, libelleAide, periodeValide, prixApresAides, reduction, typeAideValide, valeurAideValide } from "../src/lib/aides-base.ts"

let ok = 0
let total = 0
const echecs = []
function verifier(nom, condition) {
  total++
  if (condition) { ok++; console.log("  OK     " + nom) } else { echecs.push(nom); console.log("  ECHEC  " + nom) }
}

console.log("Calcul du prix apres aide")
verifier("50 % de 600 : 300 de reduction, net 300", reduction({ type: "POURCENTAGE", valeur: 50 }, 600) === 300 && prixApresAides(600, [{ nom: "a", type: "POURCENTAGE", valeur: 50 }]).prix === 300)
verifier("montant fixe 200 sur 600 : net 400", prixApresAides(600, [{ nom: "a", type: "MONTANT", valeur: 200 }]).prix === 400)
verifier("montant superieur au prix : net 0, jamais negatif", prixApresAides(600, [{ nom: "a", type: "MONTANT", valeur: 1000 }]).prix === 0)
verifier("gratuite : net 0", prixApresAides(600, [{ nom: "a", type: "GRATUIT", valeur: 0 }]).prix === 0)
verifier("100 % : net 0", prixApresAides(600, [{ nom: "a", type: "POURCENTAGE", valeur: 100 }]).prix === 0)
verifier("arrondi : 33 % de 650 = 215, net 435", prixApresAides(650, [{ nom: "a", type: "POURCENTAGE", valeur: 33 }]).prix === 435)
verifier("sans aide : prix inchange, aucune aide", (() => { const r = prixApresAides(600, []); return r.prix === 600 && r.aide === null && r.reduction === 0 })())
verifier("prix nul : aucune reduction", reduction({ type: "GRATUIT", valeur: 0 }, 0) === 0)
console.log("Choix de l'aide")
verifier("la plus avantageuse est retenue (pas de cumul)", (() => { const r = prixApresAides(600, [{ nom: "pct", type: "POURCENTAGE", valeur: 20 }, { nom: "fixe", type: "MONTANT", valeur: 300 }]); return r.aide?.nom === "fixe" && r.prix === 300 })())
verifier("a egalite, la premiere de la liste", prixApresAides(600, [{ nom: "premiere", type: "POURCENTAGE", valeur: 50 }, { nom: "seconde", type: "MONTANT", valeur: 300 }]).aide?.nom === "premiere")
console.log("Validation")
verifier("pourcentage : 0 et 101 refuses, 50 accepte", !valeurAideValide("POURCENTAGE", 0) && !valeurAideValide("POURCENTAGE", 101) && valeurAideValide("POURCENTAGE", 50))
verifier("montant : 0 et 1 000 001 refuses, 500 accepte", !valeurAideValide("MONTANT", 0) && !valeurAideValide("MONTANT", 1000001) && valeurAideValide("MONTANT", 500))
verifier("gratuite : valeur 0 seulement", valeurAideValide("GRATUIT", 0) && !valeurAideValide("GRATUIT", 5))
verifier("valeur decimale refusee", !valeurAideValide("MONTANT", 100.5))
verifier("types connus seulement", typeAideValide("GRATUIT") && !typeAideValide("REMISE") && !typeAideValide(undefined) && Object.keys(TYPES_AIDE).length === 3)
console.log("Periodes")
verifier("bornes incluses, fin ouverte acceptee", aideActiveLe("2026-11-01", "2026-11-30", "2026-11-01") && aideActiveLe("2026-11-01", "2026-11-30", "2026-11-30") && aideActiveLe("2026-11-01", null, "2027-05-01"))
verifier("avant le debut et apres la fin : inactive", !aideActiveLe("2026-11-01", "2026-11-30", "2026-10-31") && !aideActiveLe("2026-11-01", "2026-11-30", "2026-12-01"))
verifier("dates : 30 fevrier et format francais refuses", !dateIsoValide("2026-02-30") && !dateIsoValide("20/11/2026") && dateIsoValide("2026-11-20"))
verifier("periode : fin avant debut refusee, meme jour accepte", periodeValide("2026-11-10", "2026-11-09") !== null && periodeValide("2026-11-10", "2026-11-10") === null && periodeValide("2026-11-10", null) === null)
console.log("Affichage et cout")
verifier("libelles", libelleAide({ type: "POURCENTAGE", valeur: 50 }) === "50 %" && libelleAide({ type: "GRATUIT", valeur: 0 }) === "Gratuit" && libelleAide({ type: "MONTANT", valeur: 1500 }) === "1 500 FCFA par repas")
verifier("cout estime : 300 x 20 repas = 6 000", coutEstime({ type: "POURCENTAGE", valeur: 50 }, 600, 20) === 6000)

console.log("")
console.log("Resultat : " + ok + " / " + total + " verifications reussies")
console.log(echecs.length === 0 ? "=== TESTS AIDES-CALCUL OK ===" : "=== TESTS AIDES-CALCUL ECHEC ===")
process.exit(echecs.length === 0 ? 0 : 1)