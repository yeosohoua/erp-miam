import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { MenuJour } from "./menu-jour"

export const metadata: Metadata = { title: "Menu du jour" }

async function Contenu({ params }: { params: Promise<{ date: string; service: string }> }) {
  const { date, service } = await params
  return <MenuJour date={date} service={service} />
}

export default function Page({ params }: { params: Promise<{ date: string; service: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Contenu params={params} />
    </Suspense>
  )
}