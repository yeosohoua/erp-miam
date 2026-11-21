export type IssueVente = { cle: string; ok: boolean; numero?: number; erreur?: string; reessayer?: boolean }
export type RetourSyncVentes = { issues: IssueVente[] } | { erreur: string }