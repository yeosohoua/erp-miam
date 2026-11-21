import { authentifierApi, json } from "@/lib/api-auth"
import { chargerAlertes } from "@/lib/pilotage"

export async function GET(req: Request) {
  const a = await authentifierApi(req)
  if (a instanceof Response) return a
  return json({ alertes: await chargerAlertes(a.etabId) })
}