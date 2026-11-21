import "server-only"

import { ecrireAudit } from "@/lib/audit"
import { hacherCodeAcces, utilisateurPourCode } from "@/lib/codes-acces"
import { CIBLES_CONNEXION_CODE, codeValide, normaliserCode } from "@/lib/codes-acces-base"
import { db } from "@/lib/db"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"

export type ResultatConnexionMobile =
  | { status: number; erreur: string }
  | { user: { id: string; role: string; name: string; email: string; tokenVersion: number }; cible: string; etablissement: { code: string; name: string; logo: string | null } }

// Les codes sont uniques dans toute la base : l'etablissement se deduit du code (il reste acceptable en entree, et doit alors correspondre).
// Limites anti-force-brute : par adresse IP, par etablissement saisi (si fourni) et au niveau global.
export async function connecterParCode(etabBrut: string, codeBrut: string, ip: string): Promise<ResultatConnexionMobile> {
  const etabSaisi = etabBrut.trim().slice(0, 40)
  const code = normaliserCode(codeBrut)
  const cleIp = cleLimite("code-ip:" + ip)
  const cleEtab = etabSaisi ? cleLimite("code-etab:" + etabSaisi) : null
  const cleGlobal = cleLimite("code-global")
  const attentes = await Promise.all([secondesAvantReessai(cleIp), secondesAvantReessai(cleGlobal), ...(cleEtab ? [secondesAvantReessai(cleEtab)] : [])])
  const attente = Math.max(...attentes)
  if (attente > 0) {
    await ecrireAudit({ action: "LOGIN_CODE_BLOCKED", details: (etabSaisi || "code seul") + " (mobile)" })
    return { status: 429, erreur: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }
  }
  const echec = async (): Promise<ResultatConnexionMobile> => {
    await enregistrerEchec(cleIp)
    if (cleEtab) await enregistrerEchec(cleEtab, 20)
    await enregistrerEchec(cleGlobal, 500)
    await ecrireAudit({ action: "LOGIN_CODE_FAILED", details: (etabSaisi || "code seul") + " (mobile)" })
    return { status: 401, erreur: "Code incorrect ou inactif." }
  }
  if (!codeValide(code)) return echec()
  const acces = await db.codeAcces.findUnique({
    where: { codeHash: hacherCodeAcces(code) },
    select: { id: true, actif: true, cible: true, etablissement: { select: { code: true, name: true, active: true, logoId: true } } },
  })
  if (!acces || !acces.actif || !acces.etablissement.active || !(CIBLES_CONNEXION_CODE as readonly string[]).includes(String(acces.cible))) return echec()
  if (etabSaisi && acces.etablissement.code.toLowerCase() !== etabSaisi.toLowerCase()) return echec()
  const r = await utilisateurPourCode(acces.id)
  if ("erreur" in r) return { status: 403, erreur: r.erreur }
  await effacerEchecs(cleIp)
  await ecrireAudit({ userId: r.user.id, userEmail: r.user.email, action: "LOGIN_CODE_OK", details: r.cible + " (mobile)" })
  return { user: r.user, cible: String(r.cible), etablissement: { code: acces.etablissement.code, name: acces.etablissement.name, logo: acces.etablissement.logoId ? "/api/mobile/v1/images/" + acces.etablissement.logoId : null } }
}