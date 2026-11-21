export const TYPES_ETABLISSEMENT = { SCHOOL: "École", COMPANY: "Entreprise", OTHER: "Autre" } as const
export type TypeEtablissement = keyof typeof TYPES_ETABLISSEMENT

export const DEVISES = ["XOF", "EUR", "USD"] as const

export const typeValide = (v: string): v is TypeEtablissement => Object.hasOwn(TYPES_ETABLISSEMENT, v)
export const deviseValide = (v: string): boolean => (DEVISES as readonly string[]).includes(v)
export const normaliserCode = (v: string): string => v.trim().toUpperCase()
export const codeValide = (v: string): boolean => /^[A-Z0-9][A-Z0-9-]{1,11}$/.test(v)