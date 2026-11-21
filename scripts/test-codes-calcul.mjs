import { ALPHABET_CODE, codeValide, normaliserCode } from "../src/lib/codes-acces-base.ts"

const cas = [
  [ALPHABET_CODE.length === 32, "alphabet de 32 symboles"],
  [!/[IO01]/.test(ALPHABET_CODE), "sans I, O, 0, 1"],
  [normaliserCode(" ab-c d2 ") === "ABCD2", "normalisation (casse, espaces, tirets)"],
  [codeValide("K7M2P"), "code valide"],
  [!codeValide("K7M2"), "trop court"],
  [!codeValide("K7M2PX"), "trop long"],
  [!codeValide("K7M2O"), "O interdit"],
  [!codeValide("K7M21"), "1 interdit"],
  [!codeValide("k7m2p"), "minuscules refusees apres normalisation seulement"],
]
let ko = 0
for (const [ok, nom] of cas) {
  if (!ok) ko += 1
  console.log("  " + (ok ? "OK    " : "ECHEC ") + nom)
}
console.log("Resultat : " + (cas.length - ko) + " / " + cas.length + " cas reussis")
console.log(ko === 0 ? "=== TESTS CODES CALCUL OK ===" : "=== TESTS CODES CALCUL ECHEC ===")
process.exit(ko === 0 ? 0 : 1)