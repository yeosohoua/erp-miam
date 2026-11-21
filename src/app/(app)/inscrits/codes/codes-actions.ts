"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { assurerCodesEtab, basculerCodeActif, regenererCode } from "@/lib/codes-acces"
import { accesEcriture } from "@/lib/inscrits-acces"

const rafraichir = () => revalidatePath("/inscrits/codes")

export async function genererManquants(_fd: FormData): Promise<void> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return
  const { crees } = await assurerCodesEtab(acces.etabId)
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "CODES_ACCES_GENERES", entity: "Etablissement", entityId: acces.etabId, details: crees + " code(s)" })
  rafraichir()
}

export async function regenerer(id: string, _fd: FormData): Promise<void> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return
  if (!(await regenererCode(id, acces.etabId))) return
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "CODE_ACCES_REGENERE", entity: "CodeAcces", entityId: id })
  rafraichir()
}

export async function basculer(id: string, _fd: FormData): Promise<void> {
  void _fd
  const acces = await accesEcriture()
  if ("erreur" in acces) return
  const actif = await basculerCodeActif(id, acces.etabId)
  if (actif === null) return
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: actif ? "CODE_ACCES_ACTIVE" : "CODE_ACCES_DESACTIVE", entity: "CodeAcces", entityId: id })
  rafraichir()
}