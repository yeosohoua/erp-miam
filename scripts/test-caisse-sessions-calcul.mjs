import assert from "node:assert/strict"
import { ecartCloture, especesAttendues, parseMontantZero, periodeValide, rapportParCaissier, renduMonnaie, ventiler } from "../src/lib/caisse-base.ts"
import { IMAGE_MAX, detecterImage } from "../src/lib/image-base.ts"

let n = 0
const ok = (nom) => { n += 1; console.log("OK  " + n + ". " + nom) }

assert.equal(especesAttendues(5000, 1250), 6250)
assert.equal(ecartCloture(6200, 6250), -50)
assert.equal(ecartCloture(6300, 6250), 50)
assert.equal(renduMonnaie(2000, 1250), 750)
assert.equal(renduMonnaie(1000, 1250), 0)
ok("especes attendues, ecart de cloture et monnaie a rendre")

assert.equal(parseMontantZero("0"), 0)
assert.equal(parseMontantZero(" 5000 "), 5000)
assert.equal(parseMontantZero("-1"), null)
assert.equal(parseMontantZero("12.5"), null)
assert.equal(parseMontantZero(""), null)
assert.equal(parseMontantZero("1234567890"), null)
ok("montants saisis : zero accepte, negatifs et decimaux refuses")

const v = ventiler([
  { methode: "CASH", statut: "PAYEE", total: 1250 },
  { methode: "MTN", statut: "PAYEE", total: 500 },
  { methode: null, statut: "PAYEE", total: 300 },
  { methode: "CASH", statut: "ANNULEE", total: 250 },
])
assert.equal(v.nbPayees, 3)
assert.equal(v.totalPayees, 2050)
assert.equal(v.nbAnnulees, 1)
assert.equal(v.totalAnnulees, 250)
assert.equal(v.parMode.CASH.total, 1250)
assert.equal(v.parMode.COMPTE.total, 300)
ok("ventilation par mode : annulations a part, compte prepaye regroupe")

const r = rapportParCaissier([
  { caissier: "b@x", methode: "CASH", statut: "PAYEE", nb: 2, total: 1500 },
  { caissier: "a@x", methode: "MTN", statut: "PAYEE", nb: 1, total: 500 },
  { caissier: "a@x", methode: "CASH", statut: "ANNULEE", nb: 1, total: 250 },
  { caissier: "a@x", methode: "CASH", statut: "PAYEE", nb: 1, total: 250 },
])
assert.equal(r.length, 2)
assert.equal(r[0].caissier, "a@x")
assert.equal(r[0].nb, 2)
assert.equal(r[0].total, 750)
assert.equal(r[0].annulees, 1)
assert.equal(r[0].montantAnnule, 250)
assert.equal(r[0].parMode.MTN.total, 500)
assert.equal(r[1].total, 1500)
ok("rapport par caissier : tri, totaux et annulations")

assert.deepEqual(periodeValide("2026-11-20", "2026-11-21"), { du: "2026-11-20", au: "2026-11-21" })
assert.deepEqual(periodeValide("2026-01-01", "2026-12-31"), { du: "2026-01-01", au: "2026-12-31" })
assert.equal(periodeValide("2026-13-45", "2026-13-46"), null)
assert.equal(periodeValide("2026-11-21", "2026-11-20"), null)
assert.equal(periodeValide("2026-02-30", "2026-03-01"), null)
assert.equal(periodeValide("2025-01-01", "2026-06-01"), null)
assert.equal(periodeValide("abc", "2026-06-01"), null)
ok("periode du rapport : dates reelles, ordre, 366 jours au plus")

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0])
assert.equal(detecterImage(png).mime, "image/png")
assert.equal(detecterImage(jpg).mime, "image/jpeg")
assert.equal(detecterImage(webp).mime, "image/webp")
assert.equal(detecterImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null)
assert.equal(detecterImage(new TextEncoder().encode("MZ executable")), null)
assert.equal(detecterImage(new Uint8Array(0)), null)
assert.equal(IMAGE_MAX, 716800)
ok("images : PNG, JPEG et WebP reconnus par leurs octets, SVG et fichiers quelconques refuses")

console.log("=== TESTS CAISSE SESSIONS CALCUL OK ===")