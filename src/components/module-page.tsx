import { redirect } from "next/navigation"

import { ModulePlaceholder } from "@/components/module-placeholder"
import { requireSession } from "@/lib/guards"
import { findNavItem } from "@/lib/navigation"

// Garde d'acces cote serveur : un role sans droit sur le module est renvoye a l'accueil.
export async function ModulePage({ url }: { url: string }) {
  const session = await requireSession()
  const item = findNavItem(url)
  if (item?.acces && !item.acces.includes(session.role)) redirect("/")
  return <ModulePlaceholder url={url} />
}