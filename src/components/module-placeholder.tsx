import { Wrench } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { findNavItem } from "@/lib/navigation"

export function ModulePlaceholder({ url }: { url: string }) {
  const item = findNavItem(url)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{item ? item.title : "Module"}</CardTitle>
        <CardDescription>{item ? item.description : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <Wrench className="size-8" />
          <p className="text-sm">Ce module est en cours de construction.</p>
        </div>
      </CardContent>
    </Card>
  )
}