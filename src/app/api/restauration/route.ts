import { NextResponse } from "next/server"

import { ecrireAudit } from "@/lib/audit"
import { controleMotDePasse } from "@/lib/controle-mdp"
import { hasRole, SAUVEGARDE_ADMIN } from "@/lib/permissions"
import { restaurerSauvegarde } from "@/lib/sauvegarde"
import { getSession } from "@/lib/session"

const TAILLE_MAX = 50 * 1024 * 1024

export async function POST(request: Request) {
  // Protection CSRF : la requete doit venir de ce meme site.
  const origine = request.headers.get("origin")
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  let memeSite = false
  try {
    memeSite = !!origine && !!hote && new URL(origine).host === hote
  } catch {
    memeSite = false
  }
  if (!memeSite) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 })

  const session = await getSession()
  if (!session || !hasRole(session.role, SAUVEGARDE_ADMIN)) return NextResponse.json({ error: "Action réservée à l'administrateur." }, { status: 403 })

  const fd = await request.formData().catch(() => null)
  if (!fd) return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
  if (String(fd.get("confirmation") ?? "") !== "RESTAURER") return NextResponse.json({ error: "Tapez RESTAURER pour confirmer." }, { status: 400 })
  const fichier = fd.get("fichier")
  if (!(fichier instanceof File) || fichier.size === 0) return NextResponse.json({ error: "Choisissez un fichier de sauvegarde." }, { status: 400 })
  if (fichier.size > TAILLE_MAX) return NextResponse.json({ error: "Fichier trop volumineux (50 Mo maximum)." }, { status: 400 })

  const erreurMdp = await controleMotDePasse(session.userId, String(fd.get("motdepasse") ?? ""))
  if (erreurMdp) return NextResponse.json({ error: erreurMdp }, { status: 400 })

  let donnees: unknown
  try {
    donnees = JSON.parse(await fichier.text())
  } catch {
    return NextResponse.json({ error: "Fichier de sauvegarde invalide : ce n'est pas du JSON." }, { status: 400 })
  }
  const r = await restaurerSauvegarde(donnees)
  if ("erreur" in r) return NextResponse.json({ error: r.erreur }, { status: 400 })

  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BACKUP_RESTORED", details: r.lignes + " lignes" })
  return NextResponse.json({ ok: "Restauration terminée (" + r.lignes + " lignes). Reconnectez-vous si votre session est coupée." })
}