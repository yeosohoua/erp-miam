import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ConfigurationView } from "./configuration-view"

export const metadata: Metadata = { title: "Configuration" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ConfigurationView />
    </Suspense>
  )
}