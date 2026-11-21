import { authentifierApi, json } from "@/lib/api-auth"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  const a = await authentifierApi(req)
  if (a instanceof Response) return a
  const e = await db.etablissement.findUnique({ where: { id: a.etabId }, select: { code: true, name: true } })
  return json({ code: e?.code ?? null, nom: e?.name ?? null })
}