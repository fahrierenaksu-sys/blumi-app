import type { IncomingMessage } from "node:http"
import type { UserProfile } from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import { isProductEligibleAccount } from "../auth/authStore"
import type { RealtimeTicketService } from "./realtimeTicketService"

export interface RealtimeSessionActor {
  accountId: string
  userId: string
  sessionFamilyId: string
  profile: UserProfile
}

export async function authenticateRealtimeRequest(input: {
  request: IncomingMessage
  authService: AuthService
  realtimeTicketService: RealtimeTicketService
}): Promise<RealtimeSessionActor | null> {
  const ticket = readRealtimeTicket(input.request)
  if (!ticket) return null
  const sessionTokenHash = await input.realtimeTicketService.consume(ticket)
  if (!sessionTokenHash) return null
  const resolved = await input.authService.getSessionByTokenHash(sessionTokenHash)
  if (!resolved || !isProductEligibleAccount(resolved.account)) return null
  return {
    accountId: resolved.account.accountId,
    userId: resolved.account.userId,
    sessionFamilyId: resolved.session.sessionId,
    profile: {
      ...resolved.account.profile,
      avatar: { ...resolved.account.profile.avatar }
    }
  }
}

function readRealtimeTicket(request: IncomingMessage): string | null {
  const protocol = request.headers["sec-websocket-protocol"] ?? ""
  const prefix = "ticket-"
  const protocols = protocol.split(",").map((entry) => entry.trim())
  const sessionProtocol = protocols.find((entry) => entry.startsWith(prefix))
  if (!sessionProtocol) return null
  const token = sessionProtocol.slice(prefix.length).trim()
  return token || null
}
