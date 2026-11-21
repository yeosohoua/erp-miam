import { db } from "@/lib/db"
import { redis } from "@/lib/redis"

export async function GET() {
  const etat = { db: false, redis: false }
  try {
    await db.$queryRaw`SELECT 1`
    etat.db = true
  } catch {
    etat.db = false
  }
  try {
    etat.redis = (await redis().ping()) === "PONG"
  } catch {
    etat.redis = false
  }
  return Response.json(etat, { status: etat.db && etat.redis ? 200 : 503 })
}