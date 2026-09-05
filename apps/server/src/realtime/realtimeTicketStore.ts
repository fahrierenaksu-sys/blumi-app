export interface StoredRealtimeTicket {
  digest: string
  sessionTokenHash: string
  expiresAtMs: number
}

export interface RealtimeTicketStore {
  /** Returns false only when a digest collision exists; never overwrite it. */
  issue(ticket: StoredRealtimeTicket): Promise<boolean>
  /** Atomically returns and consumes a still-valid ticket. */
  consume(digest: string, now: Date): Promise<string | null>
  purgeExpired(now: Date, limit: number): Promise<number>
}

export function createInMemoryRealtimeTicketStore(): RealtimeTicketStore {
  const tickets = new Map<string, StoredRealtimeTicket>()

  return {
    async purgeExpired(now, limit) {
      assertTicketPurgeLimit(limit)
      let deleted = 0
      for (const [digest, ticket] of tickets) {
        if (ticket.expiresAtMs <= now.getTime()) {
          tickets.delete(digest)
          deleted += 1
          if (deleted >= limit) break
        }
      }
      return deleted
    },
    async issue(ticket) {
      if (tickets.has(ticket.digest)) return false
      tickets.set(ticket.digest, { ...ticket })
      return true
    },
    async consume(digest, now) {
      const ticket = tickets.get(digest)
      if (!ticket) return null
      tickets.delete(digest)
      return ticket.expiresAtMs > now.getTime()
        ? ticket.sessionTokenHash
        : null
    }
  }
}

export function assertTicketPurgeLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Ticket purge batch must be between 1 and 1000")
}
