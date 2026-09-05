import { createHash, randomBytes } from "node:crypto"
import type { AuthService } from "../auth/authService"
import { hashSessionToken, isProductEligibleAccount } from "../auth/authStore"
import {
  createInMemoryRealtimeTicketStore,
  type RealtimeTicketStore
} from "./realtimeTicketStore"

const DEFAULT_TICKET_TTL_MS = 30_000

export interface IssuedRealtimeTicket {
  ticket: string
  expiresAt: string
}

export interface RealtimeTicketService {
  issue(
    sessionToken: string,
    now?: Date
  ): Promise<IssuedRealtimeTicket | null>
  consume(ticket: string, now?: Date): Promise<string | null>
}

export function createRealtimeTicketService(options: {
  authService: AuthService
  ttlMs?: number
  ticketFactory?: () => string
  store?: RealtimeTicketStore
  requireSharedStore?: boolean
}): RealtimeTicketService {
  const ttlMs = options.ttlMs ?? DEFAULT_TICKET_TTL_MS
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 60_000) {
    throw new Error("Realtime ticket TTL must be from 1 to 60000 milliseconds.")
  }
  const ticketFactory = options.ticketFactory ?? createOpaqueTicket
  if (options.requireSharedStore && !options.store) {
    throw new Error("Production realtime tickets require a shared ticket store.")
  }
  const store = options.store ?? createInMemoryRealtimeTicketStore()

  return {
    async issue(sessionToken, now = new Date()) {
      const resolved = await options.authService.getSession(sessionToken, now)
      if (!resolved || !isProductEligibleAccount(resolved.account)) return null
      const ticket = ticketFactory()
      if (!isValidTicket(ticket)) {
        throw new Error("Realtime ticket factory returned an invalid ticket.")
      }
      const digest = hashTicket(ticket)
      const expiresAtMs = now.getTime() + ttlMs
      const issued = await store.issue({
        digest,
        sessionTokenHash: hashSessionToken(sessionToken),
        expiresAtMs
      })
      if (!issued) {
        throw new Error("Realtime ticket factory returned a duplicate ticket.")
      }
      return {
        ticket,
        expiresAt: new Date(expiresAtMs).toISOString()
      }
    },

    async consume(ticket, now = new Date()) {
      if (!isValidTicket(ticket)) return null
      const digest = hashTicket(ticket)
      return store.consume(digest, now)
    }
  }
}

function createOpaqueTicket(): string {
  return randomBytes(32).toString("base64url")
}

function hashTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex")
}

function isValidTicket(ticket: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(ticket)
}
