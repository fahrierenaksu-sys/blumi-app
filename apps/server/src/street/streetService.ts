import {
  STREET_MAX_WINDOWS,
  type AvatarLoadout,
  type ChatThread,
  type StreetChangeKind,
  type StreetResponse,
  type StreetRoom,
  type StreetWindow
} from "@blumi/contracts"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { diffStreetLook, diffStreetRoom, type StreetPlacement } from "./streetDigest"
import { isNewsInEdition, resolveStreetEdition, type StreetEdition } from "./streetEdition"
import { NO_STREET_GUESTS, type StreetGuestProvider } from "./streetGuest"
import type { StreetDigestRecord, StreetRepository } from "./streetRepository"

export class StreetUnavailableError extends Error {
  readonly code = "STREET_UNAVAILABLE"
  constructor() {
    super("The street is not available yet.")
    this.name = "StreetUnavailableError"
  }
}

interface StreetRoomSource {
  revision: number
  decor: { roomShellId: string; placedItems: readonly StreetPlacement[] }
}

export interface StreetServiceDependencies {
  repository: StreetRepository
  /** Whether migration 080 is applied (fail closed). */
  isSchemaReady(): Promise<boolean>
  /** The viewer's visible chat threads, newest first, blocks already removed. */
  listThreads(viewerUserId: string, limit: number): Promise<readonly ChatThread[]>
  /** Partners with an active mutual match or connection with the viewer. */
  listMutualPartnerIds(viewerUserId: string): Promise<ReadonlySet<string>>
  /** Partners blocked in either direction (checked here too, not only by the thread list). */
  listBlockedPartnerIds(viewerUserId: string, partnerIds: readonly string[]): Promise<readonly string[]>
  /** The accounts that may appear, in one read: deleted, banned or suspended accounts are left out. */
  listAllowedUserIds(userIds: readonly string[], now: Date): Promise<ReadonlySet<string>>
  /** Saved rooms for many accounts in one batched read; accounts without a room are absent. */
  getRooms(userIds: readonly string[]): Promise<ReadonlyMap<string, StreetRoomSource>>

  /**
   * A room privacy rule that keeps a partner's room from matches. Every window
   * stays closed for that partner. Defaults to open: no such setting exists
   * today (the Discovery showcase switch covers strangers only), and the owner
   * decided on 2026-10-17 that a home is visible to matches by default.
   */
  isRoomVisibleToMatches?(userId: string): Promise<boolean>
  guests?: StreetGuestProvider
  log?: { warn(entry: Record<string, unknown>, message: string): void }
}

export interface StreetService {
  isAvailable(): Promise<boolean>
  read(viewerUserId: string, now?: Date): Promise<StreetResponse>
  setWindowClosed(userId: string, closed: boolean): Promise<void>
  recordLookSave(userId: string, previous: AvatarLoadout | null, next: AvatarLoadout, at: Date): Promise<void>
  recordRoomSave(
    userId: string,
    previous: readonly StreetPlacement[] | null,
    next: readonly StreetPlacement[],
    revision: number,
    at: Date
  ): Promise<void>
}

export function createStreetService(deps: StreetServiceDependencies): StreetService {
  const guests = deps.guests ?? NO_STREET_GUESTS

  async function requireSchema(): Promise<void> {
    if (!(await deps.isSchemaReady())) throw new StreetUnavailableError()
  }

  /** A save never fails because of the street: the digest is a best-effort follow-up. */
  async function recordSafely(kind: "look" | "room", work: () => Promise<void>): Promise<void> {
    try {
      if (!(await deps.isSchemaReady())) return
      await work()
    } catch (error) {
      deps.log?.warn({ digest: kind, errorKind: safeOperationalErrorKind(error) }, "Street digest write failed")
    }
  }

  const service: StreetService = {
    isAvailable: () => deps.isSchemaReady(),
    async read(viewerUserId: string, now = new Date()) {
      await requireSchema()
      const edition = resolveStreetEdition(now)
      const [threads, mutual] = await Promise.all([
        deps.listThreads(viewerUserId, STREET_MAX_WINDOWS),
        deps.listMutualPartnerIds(viewerUserId)
      ])
      const matched = uniqueByPartner(threads, viewerUserId).filter(({ partnerId }) => mutual.has(partnerId))
      const blocked = new Set(await deps.listBlockedPartnerIds(viewerUserId, matched.map(({ partnerId }) => partnerId)))
      const candidates = matched.filter(({ partnerId }) => !blocked.has(partnerId))
      const allowed = await deps.listAllowedUserIds(candidates.map(({ partnerId }) => partnerId), now)
      const visible = candidates.filter(({ partnerId }) => allowed.has(partnerId)).slice(0, STREET_MAX_WINDOWS)
      const partnerIds = visible.map(({ partnerId }) => partnerId)
      const [digests, guestUsers, roomVisibility] = await Promise.all([
        deps.repository.readMany([viewerUserId, ...partnerIds]),
        guests.listUsersWithGuest(partnerIds, edition.id),
        Promise.all(partnerIds.map((partnerId) => deps.isRoomVisibleToMatches?.(partnerId) ?? Promise.resolve(true)))
      ])
      const openIds = partnerIds.filter((partnerId, index) => roomVisibility[index] && !digests.get(partnerId)?.windowClosed)
      // One batched room read for the viewer and every open window.
      const rooms = await deps.getRooms([viewerUserId, ...openIds])
      const open = new Set(openIds)
      const windows = visible.map(({ thread, partnerId }) => buildWindow(
        thread, partnerId, open.has(partnerId) ? rooms.get(partnerId) ?? null : undefined,
        digests.get(partnerId), guestUsers.has(partnerId), edition
      ))
      const selfRoom = rooms.get(viewerUserId)
      const street: StreetResponse = {
        edition: edition.id,
        self: {
          closed: digests.get(viewerUserId)?.windowClosed ?? false,
          room: selfRoom ? toStreetRoom(selfRoom) : null
        },
        windows: orderWindows(windows)
      }
      return street
    },
    async setWindowClosed(userId: string, closed: boolean) {
      await requireSchema()
      await deps.repository.setWindowClosed(userId, closed)
    },
    async recordLookSave(userId, previous, next, at) {
      const kind = diffStreetLook(previous, next)
      if (!kind) return
      await recordSafely("look", () => deps.repository.recordLookChange(userId, kind, at))
    },
    async recordRoomSave(userId, previous, next, revision, at) {
      const kind = diffStreetRoom(previous, next)
      if (!kind) return
      await recordSafely("room", () => deps.repository.recordRoomChange(userId, kind, at, revision))
    }
  }
  return Object.freeze(service)

  /** `room` is undefined for a closed window and null for an open window without a saved room. */
  function buildWindow(
    thread: ChatThread,
    partnerId: string,
    room: StreetRoomSource | null | undefined,
    digest: StreetDigestRecord | undefined,
    hasGuest: boolean,
    edition: StreetEdition
  ): StreetWindow {
    const participant = thread.participants.find((entry) => entry.userId === partnerId)
    const base = {
      threadId: thread.threadId,
      displayName: participant?.displayName?.slice(0, 80) ?? null,
      unread: thread.unreadCount ?? 0
    }
    if (room === undefined) {
      return { ...base, closed: true, avatar: null, room: null, change: null }
    }
    return {
      ...base,
      closed: false,
      avatar: participant?.avatar ?? null,
      room: room ? toStreetRoom(room) : null,
      change: resolveChange(digest, hasGuest, edition)
    }
  }
}

/** One label per window: guest > look > room (spec §1). */
function resolveChange(
  digest: StreetDigestRecord | undefined,
  hasGuest: boolean,
  edition: StreetEdition
): StreetChangeKind | null {
  if (hasGuest) return "guest"
  if (digest?.lookKind && isNewsInEdition(digest.lookChangedAt, edition)) return digest.lookKind
  if (digest?.roomKind && isNewsInEdition(digest.roomChangedAt, edition)) return digest.roomKind
  return null
}

/** Changed first, then unread, then the chat order (spec §3). Stable within each group. */
function orderWindows(windows: readonly StreetWindow[]): StreetWindow[] {
  const rank = (window: StreetWindow) => (window.change ? 0 : window.unread > 0 ? 1 : 2)
  return windows
    .map((window, index) => ({ window, index }))
    .sort((left, right) => rank(left.window) - rank(right.window) || left.index - right.index)
    .map(({ window }) => window)
}

function uniqueByPartner(threads: readonly ChatThread[], viewerUserId: string) {
  const seen = new Set<string>()
  const result: { thread: ChatThread; partnerId: string }[] = []
  for (const thread of threads) {
    const partnerId = thread.participantUserIds.find((id) => id !== viewerUserId)
    if (!partnerId || seen.has(partnerId)) continue
    seen.add(partnerId)
    result.push({ thread, partnerId })
  }
  return result
}

function toStreetRoom(source: StreetRoomSource): StreetRoom {
  return {
    roomShellId: source.decor.roomShellId,
    placedItems: source.decor.placedItems.map((item) => ({
      itemId: item.itemId,
      x: item.x,
      y: item.y,
      rotation: item.rotation as StreetRoom["placedItems"][number]["rotation"]
    }))
  }
}
