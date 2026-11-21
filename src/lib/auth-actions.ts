"use server"

import { redirect } from "next/navigation"

import { ecrireAudit } from "@/lib/audit"
import { deleteSession, getSession } from "@/lib/session"

export async function logout() {
  const session = await getSession()
  if (session) {
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "LOGOUT" })
  }
  await deleteSession()
  redirect("/login")
}