import { SidebarNav } from "@/components/sidebar-nav"
import { getSession } from "@/lib/session"

// Le role vient de la session cote serveur : le menu n'affiche que les modules ouverts a ce role.
export async function SidebarNavServeur() {
  const session = await getSession()
  return <SidebarNav role={session?.role ?? ""} />
}