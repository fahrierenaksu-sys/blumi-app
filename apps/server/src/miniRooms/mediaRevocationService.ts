import { createHmac } from "node:crypto"
import type { QueryResultRow } from "pg"

export interface MediaRevocationService { dispatchDue(): Promise<void> }
export interface MediaRevocationProvider { removeParticipant(room: string, userId: string): Promise<void> }

export function createLivekitRevocationProvider(options: {
  livekitUrl: string; apiKey: string; apiSecret: string; fetcher?: typeof fetch
}): MediaRevocationProvider {
  const endpoint = new URL(options.livekitUrl)
  endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : endpoint.protocol === "ws:" ? "http:" : endpoint.protocol
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("Invalid LiveKit endpoint")
  endpoint.pathname = "/twirp/livekit.RoomService/RemoveParticipant"
  endpoint.search = ""
  endpoint.hash = ""
  return { async removeParticipant(room, userId) {
    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const payload = Buffer.from(JSON.stringify({ iss: options.apiKey, nbf: now, exp: now + 60,
      video: { roomAdmin: true, room } })).toString("base64url")
    const signature = createHmac("sha256", options.apiSecret).update(`${header}.${payload}`).digest("base64url")
    const response = await (options.fetcher ?? fetch)(endpoint.toString(), {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${header}.${payload}.${signature}`, "content-type": "application/json" },
      body: JSON.stringify({ room, identity: userId })
    })
    // Cloud revokes even absent participants. Self-hosted reconnect denial still
    // needs deployment verification; an HTTP success is not that evidence.
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: unknown } | null
      if (response.status !== 404 || payload?.code !== "not_found") {
        throw new Error(`LiveKit removal failed (${response.status})`)
      }
    } else {
      await response.arrayBuffer()
    }
  } }
}

export function createPostgresMediaRevocationService(pool: {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}, provider: MediaRevocationProvider): MediaRevocationService {
  return { async dispatchDue() {
    await pool.query(`WITH expired AS (
      SELECT room_name, user_id FROM blumi_media_revocations WHERE completed_at < NOW() - INTERVAL '24 hours'
      ORDER BY completed_at LIMIT 100
    ) DELETE FROM blumi_media_revocations AS job USING expired
      WHERE job.room_name = expired.room_name AND job.user_id = expired.user_id
        AND job.completed_at < NOW() - INTERVAL '24 hours'`)
    const jobs = await pool.query(`WITH due AS (
      SELECT room_name, user_id FROM blumi_media_revocations WHERE completed_at IS NULL AND available_at <= NOW()
      ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 20
    ) UPDATE blumi_media_revocations AS job SET available_at = NOW() + INTERVAL '30 seconds',
      lease_token = md5(random()::text || clock_timestamp()::text), attempt_count = attempt_count + 1
      FROM due WHERE job.room_name = due.room_name AND job.user_id = due.user_id RETURNING job.*`)
    await Promise.all(jobs.rows.map(async (job) => {
      try {
        await provider.removeParticipant(String(job.room_name), String(job.user_id))
        await pool.query(`UPDATE blumi_media_revocations SET completed_at = NOW(), lease_token = NULL
          WHERE room_name = $1 AND user_id = $2 AND lease_token = $3`, [job.room_name, job.user_id, job.lease_token])
      } catch {
        await pool.query(`UPDATE blumi_media_revocations SET available_at = NOW() + INTERVAL '5 seconds',
          lease_token = NULL, last_error = 'provider_removal_failed'
          WHERE room_name = $1 AND user_id = $2 AND lease_token = $3`, [job.room_name, job.user_id, job.lease_token])
      }
    }))
  } }
}
