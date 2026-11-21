import { jwtVerify, SignJWT } from "jose"

export const COOKIE_NAME = "miam_session"
export const SESSION_DURATION_SECONDS = 60 * 60 * 12

export type SessionData = {
  userId: string
  role: string
  name: string
  email: string
  tv: number
}

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum)")
  }
  return new TextEncoder().encode(secret)
}

export async function encrypt(data: SessionData): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION_SECONDS + "s")
    .sign(getKey())
}

export async function decrypt(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] })
    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.tv !== "number"
    ) {
      return null
    }
    return { userId: payload.userId, role: payload.role, name: payload.name, email: payload.email, tv: payload.tv }
  } catch {
    return null
  }
}