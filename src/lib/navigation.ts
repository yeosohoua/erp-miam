import {
  Baby,
  Boxes,
  Briefcase,
  CalendarCheck,
  Calculator,
  LayoutDashboard,
  ReceiptText,
  ScanLine,
  Settings,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon, ChefHat, ShoppingCart, TrendingUp, HandHeart, CalendarClock, Smile, Apple, ShieldCheck, Gauge, Repeat } from "lucide-react"

import {
  ACHATS_LECTURE,
  COMPTA_LECTURE,
  FAMILLE_ACCES,
  FACTURATION_LECTURE,
  INSCRITS_LECTURE,
  MENUS_LECTURE,
  PAIEMENTS_LECTURE,
  PARAMETRES_LECTURE,
  RESERVATIONS_LECTURE,
  RH_LECTURE,
  SERVICE_LECTURE,
  STOCK_LECTURE, PRODUCTION_LECTURE, CAISSE_ACCES, ANALYTICS_LECTURE, AIDES_LECTURE, CONGES_LECTURE, SATISFACTION_LECTURE, NUTRITION_LECTURE, HACCP_LECTURE, PILOTAGE_LECTURE, REAPPRO_LECTURE, CUISINE_CENTRALE } from "@/lib/permissions"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  description: string
  acces?: readonly string[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Général",
    items: [{ title: "Tableau de bord", url: "/", icon: LayoutDashboard, description: "Vue d'ensemble de l'activité de la cantine." },
      { title: "Pilotage", url: "/pilotage", acces: PILOTAGE_LECTURE, icon: Gauge, description: "Indicateurs et objectifs, centre d'alertes et clés d'API pour vos outils externes." },
      { title: "Analytics", url: "/analytics", acces: ANALYTICS_LECTURE, icon: TrendingUp, description: "Fréquentation, finances, production, stock, caisse et inscrits : graphiques et exports." }],
  },
  {
    label: "Cantine",
    items: [
      { title: "Inscrits", url: "/inscrits", acces: INSCRITS_LECTURE, icon: Users, description: "Élèves, employés et invités : fiches, groupes, régimes et allergies." },
      { title: "Menus et recettes", url: "/menus", acces: MENUS_LECTURE, icon: UtensilsCrossed, description: "Plats, recettes, coûts, allergènes et planning des menus." },
      { title: "Réservations", url: "/reservations", acces: RESERVATIONS_LECTURE, icon: CalendarCheck, description: "Repas réservés, annulations et listes d'appel." },
      { title: "Production", url: "/production", acces: PRODUCTION_LECTURE, icon: ChefHat, description: "Prévisions de repas, quantités à produire et à commander, suivi du gaspillage." },
      { title: "Nutrition", url: "/nutrition", acces: NUTRITION_LECTURE, icon: Apple, description: "Valeurs nutritionnelles des plats, équilibre des repas et propositions de menus." },
      { title: "Hygiène et traçabilité", url: "/haccp", acces: HACCP_LECTURE, icon: ShieldCheck, description: "Températures, plan de nettoyage, non-conformités, échantillons témoins et rappel de lots." },
      { title: "Service", url: "/service", acces: SERVICE_LECTURE, icon: ScanLine, description: "Passage à la ligne par badge ou QR code, y compris hors ligne." },
      { title: "Satisfaction", url: "/satisfaction", acces: SATISFACTION_LECTURE, icon: Smile, description: "Avis sur les repas, note des plats et suggestions des familles et du personnel." },
      { title: "Caisse", url: "/caisse", acces: CAISSE_ACCES, icon: ShoppingCart, description: "Vente au comptoir : compte prépayé, espèces ou Mobile Money, avec tickets et annulation." },
    ],
  },
  {
    label: "Argent",
    items: [
      { title: "Paiements", url: "/paiements", acces: PAIEMENTS_LECTURE, icon: Wallet, description: "Comptes prépayés, recharges et Mobile Money." },
      { title: "Facturation", url: "/facturation", acces: FACTURATION_LECTURE, icon: ReceiptText, description: "Abonnements, factures mensuelles et relances." },
      { title: "Aides sociales", url: "/aides", acces: AIDES_LECTURE, icon: HandHeart, description: "Bourses, gratuités et tarifs sociaux appliqués automatiquement au prix des repas." },
      { title: "Comptabilité", url: "/comptabilite", acces: COMPTA_LECTURE, icon: Calculator, description: "Comptabilité SYSCOHADA, analytique et clôture." },
    ],
  },
  {
    label: "Approvisionnement",
    items: [
      { title: "Stock", url: "/stock", acces: STOCK_LECTURE, icon: Boxes, description: "Denrées, lots, péremptions et inventaires." },
      { title: "Achats", url: "/achats", acces: ACHATS_LECTURE, icon: Truck, description: "Fournisseurs, commandes, réceptions et factures." },
      { title: "Réapprovisionnement", url: "/reappro", acces: REAPPRO_LECTURE, icon: Repeat, description: "Stocks cibles, quantités à commander et bons de commande en brouillon." },
      { title: "Cuisine centrale", url: "/transferts", acces: CUISINE_CENTRALE, icon: Truck, description: "Transferts de marchandises entre établissements, expédition et réception." },
    ],
  },
  {
    label: "Espace parent",
    items: [{ title: "Mes enfants", url: "/famille", acces: FAMILLE_ACCES, icon: Baby, description: "Solde, recharge en ligne, repas et réservations de vos enfants." }],
  },
  {
    label: "Équipe",
    items: [{ title: "RH et paie", url: "/rh", acces: RH_LECTURE, icon: Briefcase, description: "Personnel de cuisine, présences, congés et paie." }, { title: "Congés et présences", url: "/personnel", acces: CONGES_LECTURE, icon: CalendarClock, description: "Demandes et soldes de congés, pointage du personnel, certifications et visites médicales." }],
  },
  {
    label: "Système",
    items: [{ title: "Paramètres", url: "/parametres", acces: PARAMETRES_LECTURE, icon: Settings, description: "Établissement, utilisateurs, rôles et configuration." }],
  },
]

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items)

// Menu filtre selon le role : un module sans `acces` est ouvert a tous les roles.
export function navGroupsPour(role: string): NavGroup[] {
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.acces || i.acces.includes(role)) }))
    .filter((g) => g.items.length > 0)
}

export function findNavItem(pathname: string): NavItem | undefined {
  return allNavItems.find((item) => (item.url === "/" ? pathname === "/" : pathname === item.url || pathname.startsWith(item.url + "/")))
}