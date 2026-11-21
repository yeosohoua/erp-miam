import { LIGNES_MAX, QTE_MAX, analyserPanier, modeValide, numeroTicket, parsePrix, totalPanier } from "../src/lib/caisse-base.ts"

let reussies = 0
let total = 0
const v = (cond, message) => {
  total++
  if (cond) {
    reussies++
    console.log("  OK     " + message)
  } else console.log("  ECHEC  " + message)
}

console.log("Panier")
const p = analyserPanier([{ articleId: "a", quantite: 2 }, { articleId: "b", quantite: 1 }, { articleId: "a", quantite: 3 }])
v("lignes" in p && p.lignes.length === 2, "deux articles après regroupement")
v("lignes" in p && p.lignes.find((l) => l.articleId === "a")?.quantite === 5, "quantités d'un même article additionnées (5)")
v("erreur" in analyserPanier("x"), "panier qui n'est pas une liste refusé")
v("erreur" in analyserPanier([]), "panier vide refusé")
v("erreur" in analyserPanier([{ articleId: "a", quantite: 0 }]), "quantité 0 refusée")
v("erreur" in analyserPanier([{ articleId: "a", quantite: QTE_MAX + 1 }]), "quantité 100 refusée")
v("erreur" in analyserPanier([{ articleId: "a", quantite: 1.5 }]), "quantité décimale refusée")
v("erreur" in analyserPanier([{ articleId: "a", quantite: "2" }]), "quantité en texte refusée")
v("erreur" in analyserPanier([null]), "ligne vide refusée")
v("erreur" in analyserPanier([{ articleId: "", quantite: 1 }]), "article sans identifiant refusé")
v("erreur" in analyserPanier(Array.from({ length: LIGNES_MAX + 1 }, (_, i) => ({ articleId: "x" + i, quantite: 1 }))), "trop de lignes refusé")
v("erreur" in analyserPanier([{ articleId: "a", quantite: 60 }, { articleId: "a", quantite: 60 }]), "cumul au-delà de 99 refusé")
v("lignes" in analyserPanier([{ articleId: "a", quantite: 99 }]), "99 articles acceptés")

console.log("Montants et formats")
v(totalPanier([{ prixUnitaire: 500, quantite: 2 }, { prixUnitaire: 250, quantite: 3 }]) === 1750, "total 500×2 + 250×3 = 1750")
v(numeroTicket(12) === "T-00012", "numéro de ticket T-00012")
v(parsePrix("1500") === 1500 && parsePrix(" 250 ") === 250, "prix valides")
v(parsePrix("0") === null && parsePrix("-5") === null && parsePrix("1.5") === null && parsePrix("abc") === null && parsePrix("") === null, "prix invalides refusés")
v(parsePrix("1000001") === null && parsePrix("1000000") === 1000000, "plafond de prix à 1 000 000")
v(modeValide("COMPTE") && modeValide("CASH") && !modeValide("PAYSTACK") && !modeValide(5), "modes de paiement acceptés")

console.log("")
console.log("Resultat : " + reussies + " / " + total + " verifications reussies")
if (reussies !== total) {
  console.log("=== TESTS CAISSE-CALCUL ECHEC ===")
  process.exit(1)
}
console.log("=== TESTS CAISSE-CALCUL OK ===")