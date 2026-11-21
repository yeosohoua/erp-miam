import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const jourDecale = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")
const AUJ = jourDecale(0)
const P = AUJ.slice(0, 7)
const jourP = (n) => P + "-" + String(n).padStart(2, "0")
const PROCHAIN = new Date(Date.UTC(Number(P.slice(0, 4)), Number(P.slice(5, 7)), 1)).toISOString().slice(0, 7)

let serveur = null
let navigateur = null
const resultats = []

function verifier(condition, message) {
  if (!condition) throw new Error(message)
}

async function attendre(fn, message, delai = 30000) {
  const fin = Date.now() + delai
  while (Date.now() < fin) {
    const v = await fn()
    if (v) return v
    await sleep(300)
  }
  throw new Error("Delai depasse : " + message)
}

async function etape(nom, fn) {
  try {
    await fn()
    resultats.push({ nom, ok: true })
    console.log("  OK     " + nom)
  } catch (e) {
    resultats.push({ nom, ok: false })
    console.log("  ECHEC  " + nom + " -> " + e.message)
    throw e
  }
}

async function nouvellePage() {
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1000 } })).newPage()
  p.setDefaultTimeout(30000)
  return p
}

async function connecter(BASE, email, mdp) {
  const p = await nouvellePage()
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  return p
}

async function demarrer(BASE, PORT) {
  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
}

async function terminer(nettoyer, nom, code) {
  if (navigateur) await navigateur.close().catch(() => {})
  if (serveur) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(serveur.pid), "/T", "/F"])
    else serveur.kill()
  }
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
  const reussies = resultats.filter((r) => r.ok).length
  console.log("")
  console.log("Resultat : " + reussies + " / " + resultats.length + " etapes reussies")
  console.log(code === 0 ? "=== TESTS " + nom + " OK ===" : "=== TESTS " + nom + " ECHEC ===")
  process.exit(code)
}

const PORT = 3111
const BASE = "http://localhost:" + PORT
const mdpCompta = secret()
const mdpCaisse = secret()
const mdpAutre = secret()
const COMPTA = "test-fc-compta@miam.test"
const CAISSE = "test-fc-caisse@miam.test"
const AUTRE = "test-fc-autre@miam.test"
const EMAILS = [COMPTA, CAISSE, AUTRE]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-FC", name: "ZZ Cantine FC", type: "COMPANY", prepaye: false } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-FD", name: "ZZ Cantine FD", type: "COMPANY" } })
  await db.tarif.createMany({ data: [{ etablissementId: IA.id, service: "LUNCH", prix: 500 }, { etablissementId: IA.id, service: "SNACK", prix: 200 }] })
  const creerUser = (email, name, role, mdp, etab) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(COMPTA, "Test Fc Compta", "ACCOUNTANT", mdpCompta, IA)
  await creerUser(CAISSE, "Test Fc Caisse", "CASHIER", mdpCaisse, IA)
  await creerUser(AUTRE, "Test Fc Autre", "MANAGER", mdpAutre, IB)

  const inscrit = (n) => db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZC-" + n, firstName: "Fc", lastName: "Nom" + n, badge: "ZZC" + String(n).padStart(13, "0") } })
  const i1 = await inscrit(1)
  const i2 = await inscrit(2)
  const i3 = await inscrit(3)
  const i4 = await inscrit(4)

  const servi = (ins, jour, service, extra = {}) =>
    db.reservation.create({ data: { etablissementId: IA.id, inscritId: ins.id, date: dateUtc(jour), service, statut: "BOOKED", servedAt: new Date(), ...extra } })

  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]').waitFor()
    await sleep(300)
  }
  const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)
  const detail = (p) => p.locator('[data-testid="facture-detail"]')

  await demarrer(BASE, PORT)
  const compta = await connecter(BASE, COMPTA, mdpCompta)

  let cA = null
  let cB = null

  await etape("Clients : validations, création, doublon refusé, rattachement par matricule", async () => {
    await ouvrir(compta, "/facturation/clients", "clients-page")
    const f = compta.locator('[data-testid="form-client"]')
    const creer = () => f.getByRole("button", { name: "Créer le client" }).click()
    await f.locator("#cl-name").fill("A")
    await creer()
    await f.getByText("2 à 80 caractères").waitFor()
    await f.locator("#cl-name").fill("ZZ Entreprise A")
    await f.locator("#cl-email").fill("pasunemail")
    await creer()
    await f.getByText("Adresse e-mail invalide.").waitFor()
    verifier((await db.client.count({ where: { etablissementId: IA.id } })) === 0, "aucun client créé avec des données invalides")
    await f.locator("#cl-name").fill("ZZ Entreprise A")
    await f.locator("#cl-email").fill("rh@zz-entreprise.test")
    await creer()
    await attendre(async () => (await db.client.count({ where: { etablissementId: IA.id } })) === 1, "client A créé")
    await f.locator("#cl-name").fill("ZZ Parent B")
    await creer()
    await attendre(async () => (await db.client.count({ where: { etablissementId: IA.id } })) === 2, "client B créé")
    await f.locator("#cl-name").fill("ZZ Parent B")
    await creer()
    await f.getByText("Un client porte déjà ce nom.").waitFor()
    verifier((await db.client.count({ where: { etablissementId: IA.id } })) === 2, "doublon refusé")
    cA = await db.client.findFirst({ where: { etablissementId: IA.id, name: "ZZ Entreprise A" } })
    cB = await db.client.findFirst({ where: { etablissementId: IA.id, name: "ZZ Parent B" } })

    const r = compta.locator('[data-testid="form-rattacher"]')
    await r.locator("#rt-matricule").fill("ZZC-9")
    await r.locator("#rt-client").selectOption({ label: "ZZ Entreprise A" })
    await r.getByRole("button", { name: "Rattacher" }).click()
    await r.getByText("Matricule inconnu").waitFor()
    for (const [mat, client, ins] of [["ZZC-1", "ZZ Entreprise A", i1], ["ZZC-2", "ZZ Entreprise A", i2], ["ZZC-3", "ZZ Parent B", i3]]) {
      await r.locator("#rt-matricule").fill(mat)
      await r.locator("#rt-client").selectOption({ label: client })
      await r.getByRole("button", { name: "Rattacher" }).click()
      await attendre(async () => (await db.inscrit.findUnique({ where: { id: ins.id } })).clientId === (client === "ZZ Entreprise A" ? cA.id : cB.id), "rattachement de " + mat)
    }
    verifier((await db.inscrit.findUnique({ where: { id: i4.id } })).clientId === null, "ZZC-4 reste sans client")
  })

  let fA = null
  let fB = null

  await etape("Génération : repas servis seulement, prépayé refusé, mois futur refusé, jamais deux fois", async () => {
    await servi(i1, jourP(1), "LUNCH")
    await servi(i1, jourP(2), "LUNCH")
    await servi(i1, jourP(3), "LUNCH")
    await servi(i1, jourP(1), "SNACK")
    await servi(i2, jourP(1), "LUNCH")
    await servi(i3, jourP(1), "LUNCH")
    await servi(i4, jourP(1), "LUNCH")
    await db.reservation.create({ data: { etablissementId: IA.id, inscritId: i2.id, date: dateUtc(jourP(2)), service: "LUNCH", statut: "BOOKED" } })

    await db.etablissement.update({ where: { id: IA.id }, data: { prepaye: true } })
    await ouvrir(compta, "/facturation", "facturation-page")
    const g = compta.locator('[data-testid="form-generation"]')
    await g.getByRole("button", { name: "Générer les factures" }).click()
    await g.getByText("prépayé").waitFor()
    verifier((await db.facture.count({ where: { etablissementId: IA.id } })) === 0, "prépayé : aucune facture")
    await db.etablissement.update({ where: { id: IA.id }, data: { prepaye: false } })

    await g.evaluate((el) => {
      el.noValidate = true
    })
    await g.locator("#gen-periode").fill(PROCHAIN)
    await g.getByRole("button", { name: "Générer les factures" }).click()
    await g.getByText("pas encore commencée").waitFor()

    await g.locator("#gen-periode").fill(P)
    await g.getByRole("button", { name: "Générer les factures" }).click()
    await g.getByText("2 facture(s) brouillon créée(s) pour 6 repas").waitFor()
    fA = await db.facture.findFirst({ where: { clientId: cA.id }, include: { lignes: true } })
    fB = await db.facture.findFirst({ where: { clientId: cB.id }, include: { lignes: true } })
    verifier(fA && fA.statut === "DRAFT" && fA.numero === null && fA.total === 2200 && fA.periode === P, "brouillon A : 4 déjeuners + 1 goûter = 2200")
    verifier(fB && fB.total === 500, "brouillon B : 500")
    const lunch = fA.lignes.find((l) => l.quantite === 4)
    const snack = fA.lignes.find((l) => l.quantite === 1)
    verifier(lunch && lunch.prixUnitaire === 500 && lunch.montant === 2000 && snack && snack.prixUnitaire === 200, "lignes de la facture A")
    verifier((await db.reservation.count({ where: { etablissementId: IA.id, factureId: { not: null } } })) === 6, "6 repas rattachés à une facture")
    verifier((await db.reservation.count({ where: { inscritId: i2.id, statut: "BOOKED", servedAt: null, factureId: null } })) === 1, "le repas réservé non servi n'est pas facturé")
    verifier((await db.reservation.count({ where: { inscritId: i4.id, factureId: { not: null } } })) === 0, "inscrit sans client ignoré")

    await g.locator("#gen-periode").fill(P)
    await g.getByRole("button", { name: "Générer les factures" }).click()
    await g.getByText("Aucun repas à facturer").waitFor()
    verifier((await db.facture.count({ where: { etablissementId: IA.id } })) === 2, "pas de double facturation")
  })

  await etape("Émission : délai contrôlé, numérotation continue, échéance, brouillon figé", async () => {
    await ouvrir(compta, "/facturation/" + fA.id, "facture-detail")
    verifier((await detail(compta).getAttribute("data-statut")) === "DRAFT", "brouillon affiché")
    const e = compta.locator('[data-testid="form-emission"]')
    await e.locator("#em-delai").fill("400")
    await e.getByRole("button", { name: "Émettre la facture" }).click()
    await e.getByText("Délai invalide").waitFor()
    verifier((await db.facture.findUnique({ where: { id: fA.id } })).statut === "DRAFT", "délai invalide : toujours brouillon")
    await e.locator("#em-delai").fill("10")
    await e.getByRole("button", { name: "Émettre la facture" }).click()
    await attendre(async () => (await db.facture.findUnique({ where: { id: fA.id } })).statut === "ISSUED", "facture A émise")
    const a = await db.facture.findUnique({ where: { id: fA.id } })
    verifier(a.numero === 1 && a.emisLe && a.echeance.toISOString().slice(0, 10) === jourDecale(10), "numéro 1, échéance à 10 jours")
    await ouvrir(compta, "/facturation/" + fB.id, "facture-detail")
    await compta.locator('[data-testid="form-emission"]').getByRole("button", { name: "Émettre la facture" }).click()
    await attendre(async () => (await db.facture.findUnique({ where: { id: fB.id } })).statut === "ISSUED", "facture B émise")
    const b = await db.facture.findUnique({ where: { id: fB.id } })
    verifier(b.numero === 2 && b.echeance.toISOString().slice(0, 10) === jourDecale(30), "numéro 2, échéance à 30 jours")
    await compta.reload({ waitUntil: "load" })
    await compta.locator('[data-testid="facture-detail"]').waitFor()
    verifier((await compta.locator('[data-testid="form-emission"]').count()) === 0, "plus de formulaire d'émission")
    verifier((await compta.getByRole("button", { name: "Supprimer le brouillon" }).count()) === 0, "une facture émise ne se supprime plus")
  })

  await etape("Règlements : surplus et référence refusés, partiels acceptés, facture soldée, indicateurs", async () => {
    await ouvrir(compta, "/facturation/" + fA.id, "facture-detail")
    const f = compta.locator('[data-testid="form-encaisser"]')
    verifier((await f.locator('#enc-methode option[value="PAYSTACK"]').count()) === 0, "Paystack n'est pas un mode d'encaissement manuel")
    const payer = () => f.getByRole("button", { name: "Enregistrer le règlement" }).click()
    await f.locator("#enc-montant").fill("3000")
    await payer()
    await f.getByText("supérieur au restant dû").waitFor()
    await f.locator("#enc-montant").fill("100")
    await f.locator("#enc-methode").selectOption("ORANGE")
    await payer()
    await f.getByText("obligatoire").waitFor()
    verifier((await db.reglement.count({ where: { factureId: fA.id } })) === 0, "aucun règlement invalide enregistré")
    await f.locator("#enc-montant").fill("1000")
    await payer()
    await attendre(async () => (await db.reglement.count({ where: { factureId: fA.id } })) === 1, "règlement espèces de 1000")
    verifier((await db.facture.findUnique({ where: { id: fA.id } })).statut === "ISSUED", "règlement partiel : toujours émise")
    await f.locator("#enc-montant").fill("200")
    await f.locator("#enc-methode").selectOption("ORANGE")
    await f.locator("#enc-reference").fill("ZZ-OM-1")
    await payer()
    await attendre(async () => (await db.reglement.count({ where: { factureId: fA.id } })) === 2, "règlement Orange Money")
    await f.locator("#enc-montant").fill("100")
    await f.locator("#enc-methode").selectOption("MTN")
    await f.locator("#enc-reference").fill("ZZ-OM-1")
    await payer()
    await f.getByText("déjà été enregistrée").waitFor()
    verifier((await db.reglement.count({ where: { factureId: fA.id } })) === 2, "référence jamais réutilisée")
    await f.locator("#enc-montant").fill("1000")
    await f.locator("#enc-methode").selectOption("MTN")
    await f.locator("#enc-reference").fill("ZZ-MTN-1")
    await payer()
    await attendre(async () => (await db.facture.findUnique({ where: { id: fA.id } })).statut === "PAID", "facture soldée")
    await compta.reload({ waitUntil: "load" })
    await compta.locator('[data-testid="facture-detail"]').waitFor()
    verifier((await compta.locator('[data-testid="form-encaisser"]').count()) === 0, "plus de formulaire d'encaissement")
    verifier((await compta.locator('[data-testid="reglements"] tr').count()) === 3, "trois règlements affichés")
    await ouvrir(compta, "/facturation", "facturation-page")
    const val = async (id) => Number(await compta.locator('[data-testid="' + id + '"]').getAttribute("data-valeur"))
    verifier((await val("kpi-a-encaisser")) === 500, "à encaisser : la facture B")
    verifier((await val("kpi-encaisse")) === 2200, "encaissé du mois : 2200")
    verifier((await val("kpi-facture")) === 2700, "facturé du mois : 2700")
    verifier((await compta.locator('tr[data-numero="1"][data-statut="PAID"]').count()) === 1, "ligne payée dans la liste")
  })

  await etape("Relances : seulement en retard, trois au maximum, tracées", async () => {
    await ouvrir(compta, "/facturation/" + fB.id, "facture-detail")
    verifier((await compta.locator('[data-testid="form-relance"]').count()) === 0, "pas de relance avant l'échéance")
    await db.facture.update({ where: { id: fB.id }, data: { echeance: dateUtc(jourDecale(-5)) } })
    await compta.reload({ waitUntil: "load" })
    await compta.locator('[data-testid="form-relance"]').waitFor()
    for (let n = 1; n <= 3; n++) {
      await compta.locator("#rel-note").fill("Appel " + n)
      await compta.getByRole("button", { name: "Enregistrer la relance" }).click()
      await attendre(async () => (await db.relance.count({ where: { factureId: fB.id } })) === n, "relance n°" + n)
    }
    await compta.locator('[data-testid="relances-max"]').waitFor()
    verifier((await compta.locator('[data-testid="relances"] li').count()) === 3, "trois relances affichées")
    verifier((await compta.locator('[data-testid="form-relance"]').count()) === 0, "plus de formulaire après trois relances")
    await ouvrir(compta, "/facturation", "facturation-page")
    verifier(Number(await compta.locator('[data-testid="kpi-en-retard"]').getAttribute("data-valeur")) === 500, "retard : 500")
    verifier((await compta.locator('tr[data-numero="2"][data-retard="1"]').count()) === 1, "facture B marquée en retard")
    await ouvrir(compta, "/facturation/" + fA.id, "facture-detail")
    verifier((await compta.locator('[data-testid="form-relance"]').count()) === 0, "pas de relance sur une facture payée")
  })

  await etape("Brouillon supprimé, facture annulée : les repas redeviennent facturables", async () => {
    await servi(i1, jourP(4), "LUNCH")
    const generer = async () => {
      await ouvrir(compta, "/facturation", "facturation-page")
      const g = compta.locator('[data-testid="form-generation"]')
      await g.getByRole("button", { name: "Générer les factures" }).click()
      await g.getByText("1 facture(s) brouillon créée(s) pour 1 repas").waitFor()
      return db.facture.findFirst({ where: { etablissementId: IA.id, statut: "DRAFT" } })
    }
    const c = await generer()
    verifier(c && c.total === 500, "brouillon de 500")
    verifier((await db.reservation.findFirst({ where: { inscritId: i1.id, date: dateUtc(jourP(4)) } })).factureId === c.id, "repas rattaché")
    await ouvrir(compta, "/facturation/" + c.id, "facture-detail")
    await compta.getByRole("button", { name: "Supprimer le brouillon" }).click()
    await attendre(async () => (await db.facture.count({ where: { id: c.id } })) === 0, "brouillon supprimé")
    verifier((await db.reservation.findFirst({ where: { inscritId: i1.id, date: dateUtc(jourP(4)) } })).factureId === null, "repas libéré")

    const d = await generer()
    await ouvrir(compta, "/facturation/" + d.id, "facture-detail")
    await compta.getByRole("button", { name: "Émettre la facture" }).click()
    await attendre(async () => (await db.facture.findUnique({ where: { id: d.id } })).numero === 3, "facture D émise sous le numéro 3")
    await compta.reload({ waitUntil: "load" })
    await compta.getByRole("button", { name: "Annuler la facture" }).click()
    await attendre(async () => (await db.facture.findUnique({ where: { id: d.id } })).statut === "CANCELLED", "facture D annulée")
    verifier((await db.reservation.findFirst({ where: { inscritId: i1.id, date: dateUtc(jourP(4)) } })).factureId === null, "repas libéré après annulation")
    await ouvrir(compta, "/facturation/" + fA.id, "facture-detail")
    verifier((await compta.getByRole("button", { name: "Annuler la facture" }).count()) === 0, "une facture payée ne s'annule pas")
    const e = await generer()
    verifier(e && e.id !== d.id && e.total === 500, "le repas libéré est refacturé dans un nouveau brouillon")

    await ouvrir(compta, "/facturation/clients", "clients-page")
    const f = compta.locator('[data-testid="form-client"]')
    await f.locator("#cl-name").fill("ZZ Vide")
    await f.getByRole("button", { name: "Créer le client" }).click()
    await compta.locator('tr[data-client="ZZ Vide"]').waitFor()
    await compta.locator('tr[data-client="ZZ Vide"]').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.client.count({ where: { etablissementId: IA.id, name: "ZZ Vide" } })) === 0, "client sans inscrit supprimé")
    await compta.locator('tr[data-client="ZZ Entreprise A"]').getByRole("button", { name: "Supprimer" }).click()
    await compta.getByText("Détachez d'abord les inscrits rattachés.").waitFor()
    verifier((await db.client.count({ where: { id: cA.id } })) === 1, "client avec inscrits conservé")
  })

  await etape("Droits, isolation, cohérence comptable et audit complet", async () => {
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await caisse.goto(BASE + "/facturation", { waitUntil: "load" })
    await cheminAttendu(caisse, "/", "le caissier n'accède pas à la facturation")
    await caisse.context().close()

    const autre = await connecter(BASE, AUTRE, mdpAutre)
    await autre.goto(BASE + "/facturation/" + fA.id, { waitUntil: "load" })
    await cheminAttendu(autre, "/facturation", "facture d'un autre établissement refusée")
    await ouvrir(autre, "/facturation/clients", "clients-page")
    verifier((await autre.locator('[data-testid="clients"] tbody tr').count()) === 0, "l'autre établissement ne voit aucun client")
    await autre.context().close()

    const factures = await db.facture.findMany({ where: { etablissementId: IA.id }, include: { lignes: true, reglements: true } })
    for (const f of factures) {
      verifier(f.total === f.lignes.reduce((s, l) => s + l.montant, 0), "total égal à la somme des lignes")
      const regle = f.reglements.reduce((s, r) => s + r.montant, 0)
      if (f.statut === "PAID") verifier(regle === f.total, "facture payée : règlements égaux au total")
      if (f.statut === "ISSUED") verifier(regle < f.total, "facture émise : règlements inférieurs au total")
      if (f.statut === "DRAFT") verifier(f.numero === null && regle === 0, "brouillon sans numéro ni règlement")
    }
    const numeros = factures.filter((f) => f.numero !== null).map((f) => f.numero).sort((a, b) => a - b)
    verifier(JSON.stringify(numeros) === JSON.stringify([1, 2, 3]), "numérotation continue 1, 2, 3")
    const billes = await db.reservation.count({ where: { etablissementId: IA.id, factureId: { not: null } } })
    const attendus = await db.factureLigne.aggregate({ where: { facture: { etablissementId: IA.id, statut: { in: ["DRAFT", "ISSUED", "PAID"] } } }, _sum: { quantite: true } })
    verifier(billes === (attendus._sum.quantite ?? 0), "repas facturés égaux aux quantités des factures actives")
    for (const action of ["CLIENT_CREE", "CLIENT_RATTACHE", "CLIENT_SUPPRIME", "FACTURES_GENEREES", "FACTURE_EMISE", "REGLEMENT_FACTURE", "RELANCE_FACTURE", "FACTURE_ANNULEE", "FACTURE_SUPPRIMEE"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await compta.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
}
await terminer(nettoyer, "FACTURATION", code)