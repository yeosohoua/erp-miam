import { STATUTS_TRANSFERT } from "@/lib/transfert-base"

export function transfertAfficher(statut: string): string {
  return (STATUTS_TRANSFERT as Record<string, string>)[statut] ?? statut
}