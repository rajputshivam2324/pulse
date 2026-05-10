/**
 * Shared Redis client for Next.js API routes.
 * Single lazy-initialized connection — avoids duplicate connections when
 * nonce/route.ts and verify/route.ts each held their own module-level client.
 */

import { createClient } from 'redis'

let _redisClient: ReturnType<typeof createClient> | null = null

export async function getRedis(): Promise<ReturnType<typeof createClient> | null> {
  const url = process.env.UPSTASH_REDIS_URL
  if (!url) return null

  if (!_redisClient) {
    _redisClient = createClient({ url })
    _redisClient.on('error', (err) => console.error('Redis client error:', err))
    await _redisClient.connect()
  }
  return _redisClient
}
