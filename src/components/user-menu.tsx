import { Badge } from "@/components/ui/badge"
import { LogOut } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { logout } from "@/lib/auth-actions"
import { db } from "@/lib/db"
import { LIBELLES_ROLES, type RoleValue } from "@/lib/roles"
import { getSession } from "@/lib/session"

function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

export async function UserMenu() {
  const session = await getSession()
  if (!session) return null
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { imageId: true } })

  return (
    <div className="flex items-center gap-2">
      {u?.imageId ? (
        <img data-testid="avatar-menu" src={"/api/images/" + u.imageId} alt="" className="size-8 shrink-0 rounded-full border object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground">
          {initiales(session.name)}
        </span>
      )}
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-sm font-medium">{session.name}</span>
        <Badge variant="secondary">{LIBELLES_ROLES[session.role as RoleValue] ?? session.role}</Badge>
      </div>
      <Link href="/compte" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Mon compte
      </Link>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Se déconnecter">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  )
}