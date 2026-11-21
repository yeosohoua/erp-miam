import Link from "next/link"

export function OngletsMenus() {
  return (
    <nav aria-label="Sections des menus" className="flex gap-4 border-b pb-2 text-sm">
      <Link href="/menus" className="font-medium hover:underline">
        Planning
      </Link>
      <Link href="/menus/plats" className="font-medium hover:underline">
        Plats
      </Link>
      <Link href="/menus/ingredients" className="font-medium hover:underline">
        Ingrédients
      </Link>
    </nav>
  )
}