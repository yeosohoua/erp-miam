import { ajouter, calendrier, cellule, evolution, heatmapNiveau, joursDe, jourSemaine, moisMoins, pareto, periodeAnalytics, pourcent, serieQuotidienne, tendance, tranches, versCsv, vueAnalytics, vuesPour } from "../src/lib/analytics-base.ts"

let reussies = 0
let total = 0
const v = (cond, message) => {
  total++
  if (cond) {
    reussies++
    console.log("  OK     " + message)
  } else console.log("  ECHEC  " + message)
}

console.log("Dates et séries")
v(JSON.stringify(joursDe("2026-11-20", 3)) === JSON.stringify(["2026-11-18", "2026-11-19", "2026-11-20"]), "trois derniers jours")
v(ajouter("2026-12-31", 1) === "2027-01-01", "changement d'année")
v(jourSemaine("2026-11-16") === 0 && jourSemaine("2026-11-22") === 6, "lundi = 0, dimanche = 6")
v(moisMoins("2026-02-15", 3) === "2025-11", "trois mois avant février 2026")
const s = serieQuotidienne(["2026-11-18", "2026-11-19"], new Map([["2026-11-19", 7]]))
v(s[0].valeur === 0 && s[1].valeur === 7, "série comblée avec des zéros")

console.log("Indicateurs")
v(evolution(120, 100) === 20 && evolution(0, 0) === 0 && evolution(5, 0) === null, "évolution en %")
v(pourcent(1, 3) === 33.3 && pourcent(1, 0) === null, "pourcentage à une décimale")
const p = pareto([{ nom: "B", valeur: 30 }, { nom: "A", valeur: 50 }, { nom: "C", valeur: 20 }, { nom: "Z", valeur: 0 }])
v(p.length === 3 && p[0].nom === "A" && p[0].cumulPct === 50 && p[1].cumulPct === 80 && p[2].cumulPct === 100, "Pareto trié avec cumul 50 / 80 / 100")
const t = tranches([-5, 0, 500, 1000, 1500, 20000], [0, 1000])
v(t.length === 3 && t[0].n === 2 && t[1].n === 2 && t[2].n === 2, "tranches de soldes 2 / 2 / 2")
const tr = tendance([10, 20, 30])
v(tr.pente === 10 && tr.moyenne === 20 && tr.variationPct === 100, "tendance : pente 10, +100 % sur la fenêtre")
v(tendance([5]).variationPct === null && tendance([0, 0, 0]).variationPct === null, "tendance sans données")

console.log("Calendrier thermique")
v(heatmapNiveau(0, 10) === 0 && heatmapNiveau(2, 10) === 1 && heatmapNiveau(4, 10) === 2 && heatmapNiveau(6, 10) === 3 && heatmapNiveau(10, 10) === 4, "niveaux de 0 à 4")
const cal = calendrier(joursDe("2026-11-20", 10), new Map([["2026-11-20", 100], ["2026-11-19", 50]]))
v(cal.semaines.length === 2 && cal.semaines.every((w) => w.length === 7), "deux semaines de sept cases")
v(cal.semaines[0][0] === null && cal.semaines[0][1] === null && cal.semaines[0][2]?.date === "2026-11-11", "début un mercredi : deux cases vides")
v(cal.max === 100 && cal.semaines[1][4]?.niveau === 4, "maximum au 20 novembre (vendredi)")

console.log("Rôles et export")
v(periodeAnalytics("7") === 7 && periodeAnalytics("abc") === 30 && periodeAnalytics(91) === 30, "période valide ou 30 par défaut")
v(vuesPour("CHEF").length === 4 && !vuesPour("CHEF").includes("finances") && vuesPour("MANAGER").length === 7, "le chef n'a pas les onglets financiers")
v(vueAnalytics("finances", "CHEF") === "apercu" && vueAnalytics("caisse", "MANAGER") === "caisse" && vueAnalytics("x", "ADMIN") === "apercu", "onglet inconnu ou interdit : vue d'ensemble")
v(cellule("=1+1") === "'=1+1" && cellule("+33") === "'+33" && cellule("-x") === "'-x" && cellule("@cmd") === "'@cmd", "formules neutralisées")
v(cellule(-5) === "-5" && cellule(null) === "" && cellule("a;b") === '"a;b"' && cellule('dit "oui"') === '"dit ""oui"""', "nombres négatifs, vide, séparateur et guillemets")
const csv = versCsv(["Date", "Valeur"], [["2026-11-20", 12], ["=SOMME(A1)", 3]])
v(csv.startsWith("\uFEFFDate;Valeur\r\n2026-11-20;12\r\n'=SOMME(A1);3\r\n"), "CSV avec BOM, séparateur point-virgule")

console.log("")
console.log("Resultat : " + reussies + " / " + total + " verifications reussies")
if (reussies !== total) {
  console.log("=== TESTS ANALYTICS-CALCUL ECHEC ===")
  process.exit(1)
}
console.log("=== TESTS ANALYTICS-CALCUL OK ===")