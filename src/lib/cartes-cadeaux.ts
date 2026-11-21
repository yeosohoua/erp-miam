import { createHmac, randomInt } from "node:crypto"

// Code de carte cadeau : 12 caracteres (meme alphabet que les codes d'acces, sans I, O, 0, 1), affiches par groupes de 4.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const LONGUEUR_CARTE = 12

export const normaliserCarte = (saisie: string): string => saisie.toUpperCase().replace(/[\s-]/g, "")
export const carteValide = (code: string): boolean => new RegExp("^[" + ALPHABET + "]{" + LONGUEUR_CARTE + "}$").test(code)
export const formaterCarte = (code: string): string => code.replace(/(.{4})(?=.)/g, "$1-")

export function genererCarte(): string {
  let c = ""
  for (let i = 0; i < LONGUEUR_CARTE; i++) c += ALPHABET[randomInt(ALPHABET.length)]
  return c
}

export function hacherCarte(code: string): string {
  const cle = process.env.SESSION_SECRET ?? ""
  if (!cle) throw new Error("SESSION_SECRET manquant")
  return createHmac("sha256", cle).update("carte-cadeau:" + code).digest("hex")
}