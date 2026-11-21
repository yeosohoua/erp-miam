import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { NotificationsView } from "./notifications-view"

export const metadata: Metadata = { title: "Notifications" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <NotificationsView />
    </Suspense>
  )
}