import { ecrireAudit } from "@/lib/audit"
import { hasRole, SAUVEGARDE_ADMIN } from "@/lib/permissions"
import { exporterSauvegarde } from "@/lib/sauvegarde"
import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  if (!session || !hasRole(session.role, SAUVEGARDE_ADMIN)) return new Response("Interdit", { status: 403 })
  const contenu = await exporterSauvegarde()
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BACKUP_EXPORTED" })
  const horodatage = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
  return new Response(JSON.stringify(contenu), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="erp-miam-sauvegarde-' + horodatage + '.json"',
      "Cache-Control": "no-store",
    },
  })
}