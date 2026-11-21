"use client"

import { usePathname } from "next/navigation"

import { NOM_APP } from "@/lib/marque"
import { findNavItem } from "@/lib/navigation"

export function PageTitle() {
  const pathname = usePathname()
  const item = findNavItem(pathname)
  return <h1 className="text-sm font-medium">{item ? item.title : NOM_APP}</h1>
}