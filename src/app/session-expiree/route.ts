import { NextResponse, type NextRequest } from "next/server"

import { COOKIE_NAME } from "@/lib/session-token"

export function GET(request: NextRequest) {
  const reponse = NextResponse.redirect(new URL("/login", request.url))
  reponse.cookies.delete(COOKIE_NAME)
  return reponse
}