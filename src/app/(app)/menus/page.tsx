import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { MenusView } from "./menus-view"

export const metadata: Metadata = { title: "Menus" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MenusView searchParams={searchParams} />
    </Suspense>
  )
}