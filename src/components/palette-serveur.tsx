import { Palette, type PagePalette } from "@/components/palette"
import { navGroupsPour } from "@/lib/navigation"
import { ACHATS_LECTURE, INSCRITS_LECTURE, MENUS_LECTURE, STOCK_LECTURE, hasRole } from "@/lib/permissions"
import { getSession } from "@/lib/session"

export async function PaletteServeur() {
  const session = await getSession()
  if (!session) return null
  const pages: PagePalette[] = navGroupsPour(session.role)
    .flatMap((g) => g.items)
    .map((i) => ({ title: i.title, url: i.url, description: i.description ?? "" }))
  const recherche = [INSCRITS_LECTURE, MENUS_LECTURE, STOCK_LECTURE, ACHATS_LECTURE].some((r) => hasRole(session.role, r))
  return <Palette pages={pages} recherche={recherche} />
}