import { Suspense, type ReactNode } from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { PaletteServeur } from "@/components/palette-serveur"
import { SelecteurEtablissementServeur } from "@/components/selecteur-etablissement-serveur"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { UserMenu } from "@/components/user-menu"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader
          userMenu={
            <>
              <Suspense fallback={null}>
                <PaletteServeur />
              </Suspense>
              <Suspense fallback={null}>
                <SelecteurEtablissementServeur />
              </Suspense>
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </>
          }
        />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <Suspense fallback={null}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}