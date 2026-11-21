import "dotenv/config"
import { randomBytes, randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { supprimerDemo } from "./demo-outils.mjs"

const bcrypt = bcryptModule.default ?? bcryptModule
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const RESET = process.argv.includes("--reset")
const CODES = ["GSL-COCODY", "CE-PLATEAU"]
const DOMAINE = "@miam-demo.ci"

// ---------- outils ----------
let graine = 20261120
function rnd() {
  graine |= 0
  graine = (graine + 0x6d2b79f5) | 0
  let t = Math.imul(graine ^ (graine >>> 15), 1 | graine)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const entier = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const choisir = (t) => t[Math.floor(rnd() * t.length)]
const melanger = (t) => { const c = [...t]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] } return c }
const pondere = (t) => { let r = rnd() * t.reduce((s, x) => s + x[1], 0); for (const [v, p] of t) { r -= p; if (r <= 0) return v } return t[0][0] }
const ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")
const iso = (d) => d.toISOString().slice(0, 10)
const maintenant = new Date()
const T0 = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate())
const jour = (off) => new Date(T0 + off * 864e5)
const ouvre = (off) => { const w = jour(off).getUTCDay(); return w >= 1 && w <= 5 }
const mdp = () => randomBytes(5).toString("hex") + "Aa1!"
const comptes = []

// ---------- donnees de reference ----------
const PRENOMS_G = ["Kouadio", "Yao", "Koffi", "Konan", "Ange", "Christ", "Stéphane", "Ibrahim", "Moussa", "Mamadou", "Issouf", "Seydou", "Yacouba", "Aboubacar", "Lassina", "Cédric", "Franck", "Wilfried", "Davy", "Hervé", "Axel", "Elie", "Josué", "Samuel", "Emmanuel", "Junior", "Rodrigue", "Gédéon", "Arnaud", "Dylan"]
const PRENOMS_F = ["Aya", "Adjoua", "Amenan", "Akissi", "Affoué", "Aminata", "Fatoumata", "Awa", "Mariam", "Fanta", "Prisca", "Grâce", "Esther", "Ruth", "Nathalie", "Sika", "Nadège", "Flora", "Estelle", "Josiane", "Laetitia", "Rosine", "Ornella", "Merveille", "Chancelle", "Kadidja", "Salimata", "Djénéba", "Tenin", "Gisèle"]
const NOMS = ["Kouassi", "Koné", "Traoré", "Ouattara", "Yao", "N'Guessan", "Kouadio", "Bamba", "Coulibaly", "Diabaté", "Touré", "Soro", "Gnagne", "Aka", "Tano", "Brou", "Zadi", "Kacou", "Dosso", "Fofana", "Sanogo", "Gbané", "Zézé", "Bakayoko", "Yéo", "Konaté", "Diomandé", "Doumbia", "Kamagaté", "Loukou", "Assi", "Ehui", "Gnahoré", "Dago", "Boni", "Ahoussou", "N'Dri", "Kra", "Amani", "Ettien"]

const FOURNISSEURS = [
  ["Ets Koné et Fils – Marché de gros d'Adjamé", "Adjamé, Abidjan", "ets.kone.adjame@example.com"],
  ["Poissonnerie Doumé – Ets Yao Pêche", "Port de pêche de Vridi, Abidjan", "yao.peche@example.com"],
  ["Boucherie Avicole de Yopougon – Ets Bamba", "Yopougon Siporex, Abidjan", "bamba.avicole@example.com"],
  ["Coopérative des Productrices d'Attiéké de Dabou", "Dabou", "coop.attieke.dabou@example.com"],
  ["Ets Traoré Huiles et Condiments", "Treichville, Abidjan", "traore.condiments@example.com"],
  ["Vergers de Bonoua – Ets Gnagne Fruits", "Bonoua", "gnagne.fruits@example.com"],
]
// nom, unite, cout, seuil, jours de peremption (null = longue conservation), fournisseur
const INGREDIENTS = [
  ["Riz long grain parfumé", "kg", 650, 120, null, 0], ["Attiéké frais", "kg", 800, 60, 3, 3], ["Chinchard (poisson)", "kg", 2200, 40, 5, 1],
  ["Poisson fumé", "kg", 3800, 15, 30, 1], ["Poulet de chair", "kg", 2600, 50, 4, 2], ["Banane plantain", "kg", 550, 60, 6, 0],
  ["Banane douce", "kg", 450, 30, 6, 5], ["Pâte de manioc fermentée", "kg", 600, 30, 4, 3], ["Igname", "kg", 700, 30, 20, 0],
  ["Huile de palme", "litre", 1600, 25, null, 4], ["Huile végétale", "litre", 1450, 40, null, 4], ["Pâte de graine de palme", "kg", 2100, 25, 60, 4],
  ["Pâte d'arachide", "kg", 2400, 10, 60, 4], ["Tomate fraîche", "kg", 900, 40, 6, 0], ["Concentré de tomate", "kg", 2200, 15, null, 4],
  ["Oignon", "kg", 650, 40, 20, 0], ["Ail", "kg", 2800, 5, 30, 0], ["Gingembre", "kg", 1600, 5, 20, 0], ["Piment frais", "kg", 1800, 5, 8, 0],
  ["Gombo", "kg", 1300, 15, 5, 0], ["Aubergine africaine", "kg", 800, 15, 6, 0], ["Feuilles de manioc", "kg", 750, 10, 4, 0],
  ["Haricots niébé", "kg", 1200, 30, null, 0], ["Spaghetti", "kg", 950, 25, null, 0], ["Bœuf haché", "kg", 3200, 20, 5, 2],
  ["Cube bouillon", "kg", 2600, 5, null, 4], ["Sel fin", "kg", 250, 10, null, 4], ["Orange", "kg", 500, 40, 10, 5], ["Ananas", "kg", 600, 20, 7, 5],
]
// nom, description, recette [ingredient, quantite par portion en kg ou litre]
const PLATS = [
  ["Riz sauce graine au poisson fumé", "Riz blanc, sauce graine de palme, poisson fumé", [["Riz long grain parfumé", 0.12], ["Pâte de graine de palme", 0.05], ["Poisson fumé", 0.04], ["Tomate fraîche", 0.03], ["Oignon", 0.02], ["Piment frais", 0.005], ["Sel fin", 0.002]]],
  ["Attiéké poisson braisé", "Attiéké, chinchard braisé, tomate et oignon crus", [["Attiéké frais", 0.2], ["Chinchard (poisson)", 0.18], ["Tomate fraîche", 0.04], ["Oignon", 0.04], ["Piment frais", 0.005], ["Huile végétale", 0.02]]],
  ["Riz gras au poulet", "Riz cuit dans la sauce tomate, cuisse de poulet", [["Riz long grain parfumé", 0.13], ["Poulet de chair", 0.15], ["Tomate fraîche", 0.04], ["Concentré de tomate", 0.01], ["Oignon", 0.03], ["Huile végétale", 0.02], ["Cube bouillon", 0.003]]],
  ["Placali sauce gombo", "Pâte de manioc, sauce gombo au poisson fumé", [["Pâte de manioc fermentée", 0.25], ["Gombo", 0.06], ["Poisson fumé", 0.03], ["Huile de palme", 0.01], ["Piment frais", 0.004], ["Oignon", 0.02]]],
  ["Foutou banane sauce claire", "Foutou de banane plantain et igname, sauce claire au poulet", [["Banane plantain", 0.25], ["Igname", 0.1], ["Poulet de chair", 0.1], ["Tomate fraîche", 0.04], ["Aubergine africaine", 0.03], ["Piment frais", 0.004], ["Oignon", 0.03]]],
  ["Alloco et poulet braisé", "Bananes plantains frites, poulet braisé, oignons piment", [["Banane plantain", 0.22], ["Poulet de chair", 0.18], ["Oignon", 0.03], ["Piment frais", 0.005], ["Huile végétale", 0.04]]],
  ["Garba (attiéké et thon frit)", "Attiéké, poisson frit, oignon et piment", [["Attiéké frais", 0.22], ["Chinchard (poisson)", 0.15], ["Oignon", 0.03], ["Piment frais", 0.004], ["Huile végétale", 0.05]]],
  ["Kédjenou de poulet et riz", "Poulet mijoté à l'étouffée aux légumes, riz blanc", [["Riz long grain parfumé", 0.12], ["Poulet de chair", 0.2], ["Tomate fraîche", 0.04], ["Oignon", 0.04], ["Aubergine africaine", 0.03], ["Gingembre", 0.005], ["Ail", 0.005]]],
  ["Riz sauce arachide", "Riz blanc, sauce arachide au bœuf", [["Riz long grain parfumé", 0.12], ["Pâte d'arachide", 0.04], ["Bœuf haché", 0.05], ["Tomate fraîche", 0.03], ["Oignon", 0.03]]],
  ["Haricots à l'huile de palme et plantain", "Haricots niébé, huile de palme, plantain frit", [["Haricots niébé", 0.12], ["Huile de palme", 0.03], ["Banane plantain", 0.12], ["Oignon", 0.03], ["Piment frais", 0.004]]],
  ["Spaghetti bolognaise", "Spaghetti, sauce tomate à la viande hachée", [["Spaghetti", 0.12], ["Bœuf haché", 0.06], ["Concentré de tomate", 0.015], ["Oignon", 0.03], ["Ail", 0.003], ["Huile végétale", 0.02]]],
  ["Sauce feuille et riz", "Riz blanc, sauce feuilles de manioc au poisson fumé", [["Riz long grain parfumé", 0.12], ["Feuilles de manioc", 0.1], ["Poisson fumé", 0.04], ["Huile de palme", 0.02], ["Oignon", 0.02]]],
  ["Orange de saison", "Une orange", [["Orange", 0.25]]],
  ["Banane douce", "Une banane douce", [["Banane douce", 0.15]]],
  ["Ananas en tranches", "Tranches d'ananas frais", [["Ananas", 0.2]]],
]
const ROTATION = { 1: [0, 11, 9], 2: [1, 6], 3: [2, 8, 7], 4: [3, 4], 5: [5, 10, 6] }
const DESSERTS = [12, 13, 14]

async function catalogue(etabId, tag) {
  const fournisseurs = []
  for (const [name, address, email] of FOURNISSEURS) {
    fournisseurs.push(await db.fournisseur.create({ data: { etablissementId: etabId, name, address, email, phone: "+2250000000" + String(entier(100, 999)) } }))
  }
  const ing = {}
  let n = 0
  for (const [name, unit, cout, seuil, peremption, f] of INGREDIENTS) {
    n++
    const stock = Math.round(seuil * (n % 7 === 0 ? 0.45 : 0.9 + rnd() * 2.2) * 10) / 10
    const i = await db.ingredient.create({ data: { etablissementId: etabId, name, unit, unitCost: cout, stock, seuil } })
    const per = peremption === null ? null : (name === "Tomate fraîche" && tag === "GSL" ? jour(-1) : jour(peremption + entier(0, 6)))
    const lot = await db.lot.create({ data: { etablissementId: etabId, ingredientId: i.id, reference: `LOT-${tag}-${String(n).padStart(3, "0")}`, quantite: Math.round(stock * 1.25 * 10) / 10, restante: stock, prix: cout, peremption: per, recuLe: jour(-entier(2, 14)) } })
    await db.mouvementStock.create({ data: { etablissementId: etabId, ingredientId: i.id, lotId: lot.id, type: "ENTREE", quantite: lot.quantite, prix: cout, reference: lot.reference, note: "Réception initiale", createdAt: lot.recuLe } })
    ing[name] = { id: i.id, cout, f }
  }
  const plats = []
  for (const [name, description, recette] of PLATS) {
    const p = await db.plat.create({ data: { etablissementId: etabId, name, description, portions: 1 } })
    await db.platIngredient.createMany({ data: recette.map(([nom, q]) => ({ platId: p.id, ingredientId: ing[nom].id, quantity: q })) })
    const cout = Math.round(recette.reduce((s, [nom, q]) => s + q * ing[nom].cout, 0))
    plats.push({ id: p.id, name, cout })
  }
  // menus : 6 semaines passees et 2 semaines a venir
  const menus = {}
  for (let off = -42; off <= 14; off++) {
    if (!ouvre(off)) continue
    const d = jour(off)
    const semaine = Math.floor((off + 42) / 7)
    const liste = ROTATION[d.getUTCDay()]
    const principal = liste[semaine % liste.length]
    const dessert = DESSERTS[(semaine + d.getUTCDay()) % DESSERTS.length]
    const m = await db.menu.create({ data: { etablissementId: etabId, date: d, service: "LUNCH", statut: off <= 7 ? "PUBLISHED" : "DRAFT" } })
    await db.menuPlat.createMany({ data: [{ menuId: m.id, platId: plats[principal].id }, { menuId: m.id, platId: plats[dessert].id }] })
    menus[off] = { principal: plats[principal] }
  }
  // bons de commande
  const bon = async (numero, statut, f, lignes, off) => {
    const b = await db.bonCommande.create({ data: { etablissementId: etabId, fournisseurId: fournisseurs[f].id, numero, statut, envoyeLe: statut === "DRAFT" ? null : jour(off), createdAt: jour(off - 1) } })
    await db.bonCommandeLigne.createMany({ data: lignes.map(([nom, q]) => ({ bonId: b.id, ingredientId: ing[nom].id, quantite: q, prix: ing[nom].cout, recue: statut === "RECEIVED" ? q : 0 })) })
  }
  await bon(1, "RECEIVED", 0, [["Riz long grain parfumé", 200], ["Oignon", 60], ["Tomate fraîche", 50]], -12)
  await bon(2, "SENT", 1, [["Chinchard (poisson)", 60], ["Poisson fumé", 15]], -2)
  await bon(3, "DRAFT", 2, [["Poulet de chair", 80]], 0)
  // carte du comptoir
  const carte = [["Beignets (4 pièces)", 200, "Snacks"], ["Pain-omelette", 600, "Snacks"], ["Sandwich poulet", 800, "Snacks"], ["Jus de bissap", 300, "Boissons"], ["Jus de gingembre", 300, "Boissons"], ["Eau minérale 50 cl", 250, "Boissons"], ["Yaourt nature", 250, "Boissons"], ["Biscuits", 150, "Snacks"]]
  await db.articleCarte.createMany({ data: carte.map(([nom, prix, categorie]) => ({ etablissementId: etabId, nom, prix, categorie })) })
  return { plats, menus, ing }
}

function nouvelUtilisateur(etabIds, email, name, role) {
  const motDePasse = mdp()
  comptes.push({ role, email, motDePasse })
  return db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(motDePasse, 10), active: true, etablissements: { create: etabIds.map((etablissementId) => ({ etablissementId })) } } })
}

async function principal() {
  const existants = await db.etablissement.findMany({ where: { code: { in: CODES } }, select: { id: true } })
  if (existants.length && !RESET) { console.log("Les donnees de demonstration existent deja. Relancez avec --reset pour les remplacer."); return }
  if (RESET) {
    await supprimerDemo(db, { confirmer: true })
    console.log("Donnees de demonstration precedentes supprimees.")
  }

  // ======================= GROUPE SCOLAIRE =======================
  const E = await db.etablissement.create({ data: { code: "GSL-COCODY", name: "Groupe Scolaire Les Lagunes", type: "SCHOOL", address: "Cocody Riviera Palmeraie, Abidjan", phone: "+2250000000001", email: "direction@gs-leslagunes.example.com", currency: "XOF", prepaye: true } })
  const groupes = {}
  for (const g of ["CP1 A", "CE1 A", "CE2 A", "CM1 A", "CM2 A", "6ème A", "5ème A"]) groupes[g] = await db.referentiel.create({ data: { etablissementId: E.id, kind: "GROUPE", name: g } })
  const regimes = {}
  for (const r of ["Standard", "Sans porc", "Sans piment"]) regimes[r] = await db.referentiel.create({ data: { etablissementId: E.id, kind: "REGIME", name: r } })
  for (const a of ["Arachide", "Poisson", "Œuf", "Gluten", "Lait"]) await db.referentiel.create({ data: { etablissementId: E.id, kind: "ALLERGIE", name: a } })

  const effectifs = [["CP1 A", 8, 600], ["CE1 A", 8, 600], ["CE2 A", 8, 600], ["CM1 A", 9, 600], ["CM2 A", 9, 600], ["6ème A", 9, 800], ["5ème A", 9, 800]]
  const eleves = []
  let rang = 0
  for (const [classe, nb, prix] of effectifs) {
    for (let k = 0; k < nb; k++) {
      rang++
      const fille = rnd() < 0.5
      eleves.push({ id: randomUUID(), classe, prix, prenom: choisir(fille ? PRENOMS_F : PRENOMS_G), nom: NOMS[(rang * 7 + k * 3) % NOMS.length], rang })
    }
  }
  // consommations et mouvements financiers, jour apres jour
  const reservations = []
  const transactions = []
  const parJour = {}
  const joursEcole = []
  for (let off = -42; off <= -1; off++) if (ouvre(off)) joursEcole.push(off)
  let refN = 0
  for (const e of eleves) {
    e.solde = 0
    e.statut = e.rang % 29 === 0 ? "SUSPENDED" : e.rang === 17 ? "LEFT" : "ACTIVE"
    const preferee = pondere([["ORANGE", 40], ["MTN", 25], ["WAVE", 25], ["CASH", 6], ["MOOV", 4]])
    for (const off of joursEcole) {
      if (e.statut !== "ACTIVE") continue
      const w = jour(off).getUTCDay()
      if (rnd() > (w === 5 ? 0.8 : 0.9)) continue
      const sert = rnd() < 0.94
      const rid = randomUUID()
      reservations.push({ id: rid, etablissementId: E.id, inscritId: e.id, date: jour(off), service: "LUNCH", statut: "BOOKED", servedAt: sert ? new Date(T0 + off * 864e5 + 12.5 * 36e5 + entier(0, 40) * 6e4) : null, walkIn: false })
      if (!sert) continue
      if (e.solde < e.prix) {
        const montant = choisir([5000, 5000, 10000, 10000, 15000])
        const methode = rnd() < 0.8 ? preferee : "CASH"
        refN++
        transactions.push({ etablissementId: E.id, inscritId: e.id, type: "TOPUP", methode, montant, reference: (methode === "CASH" ? "REC-" : methode === "ORANGE" ? "OM-" : methode === "MTN" ? "MOMO-" : methode === "WAVE" ? "WAVE-" : "MOOV-") + String(refN).padStart(6, "0"), note: "Recharge " + ({ CASH: "en espèces à la caisse", ORANGE: "Orange Money", MTN: "MTN MoMo", WAVE: "Wave", MOOV: "Moov Money" })[methode], createdAt: new Date(T0 + off * 864e5 + 7.75 * 36e5) })
        e.solde += montant
      }
      refN++
      transactions.push({ etablissementId: E.id, inscritId: e.id, type: "DEBIT", montant: -e.prix, reference: `REPAS-${iso(jour(off))}-${String(e.rang).padStart(3, "0")}`, reservationId: rid, note: "Repas du midi", createdAt: new Date(T0 + off * 864e5 + 12.5 * 36e5) })
      e.solde -= e.prix
      parJour[off] = (parJour[off] ?? 0) + 1
    }
  }
  const tuteurs = []
  const parents = []
  for (const e of eleves) {
    const pere = rnd() < 0.5
    const prenomTuteur = pere ? choisir(PRENOMS_G) : choisir(PRENOMS_F)
    const email = `${ascii(prenomTuteur)}.${ascii(e.nom)}${e.rang}@example.com`
    tuteurs.push({ inscritId: e.id, name: `${pere ? "M." : "Mme"} ${prenomTuteur} ${e.nom}`, relation: pere ? "Père" : "Mère", phone: "+2250000000" + String(100 + e.rang), email })
    if (rnd() < 0.35) tuteurs.push({ inscritId: e.id, name: `${pere ? "Mme" : "M."} ${pere ? choisir(PRENOMS_F) : choisir(PRENOMS_G)} ${e.nom}`, relation: pere ? "Mère" : "Père", phone: "+2250000001" + String(100 + e.rang), email: null })
    if (parents.length < 3 && e.statut === "ACTIVE" && e.rang % 10 === 4) parents.push({ nom: tuteurs[tuteurs.length - 1].name, email })
  }
  await db.inscrit.createMany({
    data: eleves.map((e) => ({
      id: e.id, etablissementId: E.id, matricule: `26GSL${String(e.rang).padStart(4, "0")}`, firstName: e.prenom, lastName: e.nom, type: "STUDENT", statut: e.statut,
      groupeId: groupes[e.classe].id, regimeId: regimes[e.rang % 11 === 0 ? "Sans porc" : e.rang % 13 === 0 ? "Sans piment" : "Standard"].id, badge: `BDG-GSL-${String(e.rang).padStart(4, "0")}`, solde: e.solde,
    })),
  })
  await db.tuteur.createMany({ data: tuteurs })
  await db.reservation.createMany({ data: reservations })
  await db.transaction.createMany({ data: transactions })
  await db.consommation.createMany({ data: Object.entries(parJour).map(([off, repas]) => ({ etablissementId: E.id, date: jour(Number(off)), service: "LUNCH", repas, userEmail: `caissier${DOMAINE}` })) })

  const cat = await catalogue(E.id, "GSL")
  // gaspillage
  const types = ["RESTE_ASSIETTE", "INVENDU", "PREPARE_EN_TROP"]
  const g = []
  for (const off of melanger(joursEcole).slice(0, 16)) {
    const p = cat.menus[off].principal
    const portions = entier(2, 12)
    g.push({ etablissementId: E.id, date: jour(off), service: "LUNCH", platId: p.id, platNom: p.name, portions, coutPortion: p.cout, cout: portions * p.cout, type: choisir(types), note: null, userEmail: `chef${DOMAINE}` })
  }
  await db.gaspillage.createMany({ data: g })

  // ======================= CANTINE D'ENTREPRISE =======================
  const P = await db.etablissement.create({ data: { code: "CE-PLATEAU", name: "Cantine Plateau Services SA", type: "COMPANY", address: "Avenue Franchet d'Esperey, Plateau, Abidjan", phone: "+2250000000002", email: "restauration@plateau-services.example.com", currency: "XOF", prepaye: false } })
  const dep = {}
  for (const d of ["Direction", "Comptabilité", "Logistique", "Commercial", "Production"]) dep[d] = await db.referentiel.create({ data: { etablissementId: P.id, kind: "GROUPE", name: d } })
  const stdP = await db.referentiel.create({ data: { etablissementId: P.id, kind: "REGIME", name: "Standard" } })
  const deps = Object.keys(dep)
  const employes = []
  for (let k = 1; k <= 18; k++) {
    const fille = rnd() < 0.45
    employes.push({ id: randomUUID(), rang: k, prenom: choisir(fille ? PRENOMS_F : PRENOMS_G), nom: NOMS[(k * 5 + 2) % NOMS.length], dep: deps[k % deps.length] })
  }
  await db.inscrit.createMany({ data: employes.map((e) => ({ id: e.id, etablissementId: P.id, matricule: `EMP-${String(e.rang).padStart(3, "0")}`, firstName: e.prenom, lastName: e.nom, type: "EMPLOYEE", statut: "ACTIVE", groupeId: dep[e.dep].id, regimeId: stdP.id, badge: `BDG-PLT-${String(e.rang).padStart(4, "0")}`, solde: 0 })) })
  const resP = []
  const parJourP = {}
  for (let off = -28; off <= -1; off++) {
    if (!ouvre(off)) continue
    for (const e of employes) {
      if (rnd() > 0.78) continue
      const sert = rnd() < 0.9
      resP.push({ etablissementId: P.id, inscritId: e.id, date: jour(off), service: "LUNCH", statut: "BOOKED", servedAt: sert ? new Date(T0 + off * 864e5 + 12.75 * 36e5) : null, walkIn: false })
      if (sert) parJourP[off] = (parJourP[off] ?? 0) + 1
    }
  }
  await db.reservation.createMany({ data: resP })
  await db.consommation.createMany({ data: Object.entries(parJourP).map(([off, repas]) => ({ etablissementId: P.id, date: jour(Number(off)), service: "LUNCH", repas })) })
  await catalogue(P.id, "PLT")

  // ======================= COMPTES =======================
  const equipe = [
    [[E.id], "marie-laure.aka", "Marie-Laure Aka", "MANAGER"], [[E.id], "ibrahim.coulibaly", "Ibrahim Coulibaly", "CASHIER"], [[E.id], "moussa.diabate", "Moussa Diabaté", "CHEF"],
    [[E.id], "kouame.brou", "Kouamé Brou", "STOREKEEPER"], [[E.id], "aminata.fofana", "Aminata Fofana", "PURCHASER"], [[E.id], "adjoua.tano", "Adjoua Tano", "HR"],
    [[E.id], "serge.ndri", "Serge N'Dri", "ACCOUNTANT"], [[P.id], "jean-marc.gbane", "Jean-Marc Gbané", "MANAGER"],
  ]
  for (const [etabs, id, name, role] of equipe) await nouvelUtilisateur(etabs, id + DOMAINE, name, role)
  for (const p of parents) await nouvelUtilisateur([E.id], p.email, p.nom, "PARENT")
  // l'administrateur existant accede aux deux nouveaux etablissements
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
  let liens = 0
  for (const a of admins) for (const etablissementId of [E.id, P.id]) {
    try { await db.userEtablissement.create({ data: { userId: a.id, etablissementId } }); liens++ } catch { /* deja lie */ }
  }

  console.log("")
  console.log("=== DONNEES DE DEMONSTRATION CREEES ===")
  console.log(`Groupe scolaire : ${eleves.length} eleves, ${tuteurs.length} tuteurs, ${reservations.length} reservations, ${transactions.length} mouvements de compte`)
  console.log(`Cantine d'entreprise : ${employes.length} employes, ${resP.length} reservations`)
  console.log(`Catalogue par etablissement : ${PLATS.length} plats, ${INGREDIENTS.length} ingredients, ${FOURNISSEURS.length} fournisseurs, 3 bons de commande`)
  console.log(`Administrateur(s) lie(s) aux nouveaux etablissements : ${liens}`)
  console.log("")
  console.log("Comptes (mot de passe genere, a noter maintenant) :")
  for (const c of comptes) console.log(`  ${c.role.padEnd(12)} ${c.email.padEnd(46)} ${c.motDePasse}`)
}

principal()
  .catch((e) => { console.error("Echec : " + (e && e.message ? e.message : e)); process.exitCode = 1 })
  .finally(() => db.$disconnect())