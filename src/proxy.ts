import { NextResponse, type NextRequest } from "next/server"

import { COOKIE_NAME, decrypt } from "@/lib/session-token"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await decrypt(request.cookies.get(COOKIE_NAME)?.value)
  const estPageLogin = pathname === "/login" || pathname.startsWith("/login/")
  const estSante = pathname === "/api/sante" || pathname === "/api/paystack/webhook" || pathname === "/api/paystack/retour" || pathname === "/api/notifications/traiter" || pathname === "/sw-service.js" || pathname.startsWith("/api/v1/") || pathname.startsWith("/api/mobile/") || pathname === "/api/reappro/traiter"

  if (estSante) return NextResponse.next()
  if (!session && !estPageLogin) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  const restreint = !!session && (session.role === "ELEVE" || session.role === "EMPLOYE")
  if (restreint) {
    const permis = pathname === "/mon-espace" || pathname.startsWith("/mon-espace/") || pathname.startsWith("/api/images/")
    if (!permis) return NextResponse.redirect(new URL("/mon-espace", request.url))
    return NextResponse.next()
  }
  if (session && estPageLogin) {
    return NextResponse.redirect(new URL("/", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}