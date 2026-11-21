import Link from "next/link"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navGroupsPour } from "@/lib/navigation"

function estActif(url: string, pathname: string | null): boolean {
  if (pathname === null) return false
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/")
}

export function NavGroups({ pathname, role }: { pathname: string | null; role: string }) {
  return (
    <SidebarContent data-testid="menu-principal">
      {navGroupsPour(role).map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton isActive={estActif(item.url, pathname)} tooltip={item.title} render={<Link href={item.url} />}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}