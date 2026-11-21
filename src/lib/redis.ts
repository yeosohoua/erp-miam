import "server-only"

import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { redis?: Redis }

// Connexion creee a la premiere utilisation : le build n'a besoin d'aucun Redis.
export function redis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error("REDIS_URL manquant")
    }
    globalForRedis.redis = new Redis(url, { maxRetriesPerRequest: 2 })
  }
  return globalForRedis.redis
}