"use client"

import { usePathname } from "next/navigation"

import { NavGroups } from "@/components/nav-groups"

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname()
  return <NavGroups pathname={pathname} role={role} />
}