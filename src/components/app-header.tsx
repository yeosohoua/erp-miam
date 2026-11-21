import { Suspense, type ReactNode } from "react"

import { PageTitle } from "@/components/page-title"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NOM_APP } from "@/lib/marque"

export function AppHeader({ userMenu }: { userMenu?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Suspense fallback={<h1 className="text-sm font-medium">{NOM_APP}</h1>}>
        <PageTitle />
      </Suspense>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {userMenu}
      </div>
    </header>
  )
}