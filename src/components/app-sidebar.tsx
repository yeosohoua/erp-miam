import Link from "next/link"
import { UtensilsCrossed } from "lucide-react"
import { Suspense } from "react"

import { SidebarNavServeur } from "@/components/sidebar-nav-serveur"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { NOM_APP } from "@/lib/marque"

function MenuEnChargement() {
  return (
    <SidebarContent>
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </SidebarContent>
  )
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <UtensilsCrossed className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{NOM_APP}</span>
                <span className="truncate text-xs text-muted-foreground">Gestion de cantine</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <Suspense fallback={<MenuEnChargement />}>
        <SidebarNavServeur />
      </Suspense>

      <SidebarFooter>
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">v0.1</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}