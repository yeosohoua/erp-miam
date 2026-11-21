import "server-only"

import { redirect } from "next/navigation"

import { getSession, type SessionData } from "@/lib/session"

export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session) {
    redirect("/session-expiree")
  }
  return session
}