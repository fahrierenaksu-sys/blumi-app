import type {
  MiniRoom,
  MiniRoomInvite,
  MiniRoomInviteStatus
} from "@blumi/contracts"
import type { PersonalRoomDecorSnapshot } from "../rooms/personalRoomDecorRepository"

export interface MiniRoomInviteRecord extends MiniRoomInvite {
  status: MiniRoomInviteStatus
  decidedAt?: string
}

export interface MiniRoomRecord extends MiniRoom {
  startedAt: string
  endedAt?: string
  endedByUserId?: string
  completionIntent?: MiniRoomCompletionIntent
}

export interface MiniRoomCompletionIntent {
  rewardDate: string
  requestedAt: string
  requestedByUserId: string
}

export type AcceptPendingMiniRoomResult =
  | "accepted"
  | "invite_unavailable"
  | "participant_busy"

export interface MiniRoomRepository {
  saveInvite(invite: MiniRoomInviteRecord): Promise<void>
  createOrFindPendingChatInvite(
    invite: MiniRoomInviteRecord,
    now?: Date
  ): Promise<{ invite: MiniRoomInviteRecord; created: boolean }>
  findInvite(inviteId: string): Promise<MiniRoomInviteRecord | null>
  listInvitesForThread(
    sourceThreadId: string,
    now?: Date
  ): Promise<MiniRoomInviteRecord[]>
  transitionPendingInvite(input: {
    inviteId: string
    status: "declined" | "expired" | "cancelled"
    decidedAt: string
  }): Promise<boolean>
  listPendingInvitesForUser(userId: string, now?: Date): Promise<MiniRoomInviteRecord[]>
  acceptPendingInvite(input: {
    inviteId: string
    decidedAt: string
    miniRoom: MiniRoomRecord
  }): Promise<AcceptPendingMiniRoomResult>
  rollbackAcceptedMiniRoom(input: {
    inviteId: string
    miniRoomId: string
    decidedAt: string
  }): Promise<boolean>
  findMiniRoom(miniRoomId: string): Promise<MiniRoomRecord | null>
  findMiniRoomByInviteId(inviteId: string): Promise<MiniRoomRecord | null>
  findActiveMiniRoomForUser(userId: string): Promise<MiniRoomRecord | null>
  anchorMiniRoomCompletion(input: {
    miniRoomId: string
    requestedByUserId: string
    requestedAt: string
    rewardDate: string
  }): Promise<MiniRoomCompletionIntent | null>
  endMiniRoom(
    miniRoomId: string,
    endedByUserId: string,
    endedAt: string
  ): Promise<MiniRoomRecord | null>
  separateUserPair(input: {
    actorUserId: string
    otherUserId: string
    endedAt: string
  }): Promise<MiniRoomRecord[]>
}

export interface InMemoryMiniRoomStore {
  invites: Map<string, MiniRoomInviteRecord>
  miniRooms: Map<string, MiniRoomRecord>
  roomInviteIds: Map<string, string>
}

export function createInMemoryMiniRoomStore(): InMemoryMiniRoomStore {
  return {
    invites: new Map(),
    miniRooms: new Map(),
    roomInviteIds: new Map()
  }
}

export function createInMemoryMiniRoomRepository(
  store: InMemoryMiniRoomStore = createInMemoryMiniRoomStore(),
  getPersonalRoomDecor?: (userId: string) => Promise<PersonalRoomDecorSnapshot | null>
): MiniRoomRepository {
  return {
    async saveInvite(invite) {
      store.invites.set(invite.inviteId, cloneInvite(invite))
    },
    async createOrFindPendingChatInvite(invite, now = new Date()) {
      if (!invite.sourceThreadId) {
        throw new Error("Chat room invites require a source thread.")
      }
      expireThreadInvites(store, invite.sourceThreadId, now)
      const existing = [...store.invites.values()].find(
        (entry) =>
          entry.sourceThreadId === invite.sourceThreadId &&
          entry.status === "pending"
      )
      if (existing) return { invite: cloneInvite(existing), created: false }
      store.invites.set(invite.inviteId, cloneInvite(invite))
      return { invite: cloneInvite(invite), created: true }
    },
    async findInvite(inviteId) {
      const invite = store.invites.get(inviteId)
      return invite ? hydrateInviteWithRoom(store, invite) : null
    },
    async listInvitesForThread(sourceThreadId, now = new Date()) {
      expireThreadInvites(store, sourceThreadId, now)
      return [...store.invites.values()]
        .filter((invite) => invite.sourceThreadId === sourceThreadId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((invite) => hydrateInviteWithRoom(store, invite))
    },
    async transitionPendingInvite(input) {
      const invite = store.invites.get(input.inviteId)
      if (!invite || invite.status !== "pending") return false
      store.invites.set(input.inviteId, {
        ...invite,
        status: input.status,
        decidedAt: input.decidedAt
      })
      return true
    },
    async listPendingInvitesForUser(userId) {
      return [...store.invites.values()]
        .filter(
          (invite) =>
            invite.status === "pending" &&
            (invite.senderUserId === userId || invite.recipientUserId === userId)
        )
        .map(cloneInvite)
    },
    async acceptPendingInvite(input) {
      // Resolve before the synchronous claim; concurrent decisions must recheck status afterwards.
      const senderUserId = store.invites.get(input.inviteId)?.senderUserId
      const snapshot = senderUserId && getPersonalRoomDecor ? await getPersonalRoomDecor(senderUserId) : null
      const invite = store.invites.get(input.inviteId)
      if (!invite || invite.status !== "pending") {
        return "invite_unavailable"
      }
      if (
        invite.expiresAt &&
        Date.parse(invite.expiresAt) <= Date.parse(input.decidedAt)
      ) {
        store.invites.set(input.inviteId, {
          ...invite,
          status: "expired",
          decidedAt: input.decidedAt
        })
        return "invite_unavailable"
      }
      const participantIsBusy = [...store.miniRooms.values()].some(
        (entry) =>
          !entry.endedAt &&
          entry.participantUserIds.some((userId) =>
            input.miniRoom.participantUserIds.includes(userId)
          )
      )
      if (participantIsBusy) {
        store.invites.set(input.inviteId, {
          ...invite,
          status: "cancelled",
          decidedAt: input.decidedAt
        })
        return "participant_busy"
      }
      store.invites.set(input.inviteId, {
        ...invite,
        status: "accepted",
        decidedAt: input.decidedAt
      })
      store.miniRooms.set(
        input.miniRoom.miniRoomId,
        cloneMiniRoom({ ...input.miniRoom, sharedDecor: {
          ownerUserId: invite.senderUserId,
          revision: snapshot?.revision ?? 0,
          capturedAt: input.decidedAt,
          source: snapshot ? "inviter" : "default",
          decor: snapshot?.decor ?? { schemaVersion: 3, geometryVersion: "room_v2", roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
        } })
      )
      store.roomInviteIds.set(input.miniRoom.miniRoomId, input.inviteId)
      return "accepted"
    },
    async rollbackAcceptedMiniRoom(input) {
      const invite = store.invites.get(input.inviteId)
      const roomInviteId = store.roomInviteIds.get(input.miniRoomId)
      if (
        !invite ||
        invite.status !== "accepted" ||
        roomInviteId !== input.inviteId
      ) {
        return false
      }
      store.miniRooms.delete(input.miniRoomId)
      store.roomInviteIds.delete(input.miniRoomId)
      store.invites.set(input.inviteId, {
        ...invite,
        status: "cancelled",
        decidedAt: input.decidedAt
      })
      return true
    },
    async findMiniRoom(miniRoomId) {
      const miniRoom = store.miniRooms.get(miniRoomId)
      return miniRoom ? cloneMiniRoom(miniRoom) : null
    },
    async findMiniRoomByInviteId(inviteId) {
      const miniRoomId = [...store.roomInviteIds.entries()].find(
        ([, roomInviteId]) => roomInviteId === inviteId
      )?.[0]
      const miniRoom = miniRoomId ? store.miniRooms.get(miniRoomId) : null
      return miniRoom ? cloneMiniRoom(miniRoom) : null
    },
    async findActiveMiniRoomForUser(userId) {
      const miniRoom =
        [...store.miniRooms.values()].find(
          (entry) =>
            !entry.endedAt && entry.participantUserIds.includes(userId)
        ) ?? null
      return miniRoom ? cloneMiniRoom(miniRoom) : null
    },
    async anchorMiniRoomCompletion(input) {
      const miniRoom = store.miniRooms.get(input.miniRoomId)
      if (
        !miniRoom ||
        miniRoom.endedAt ||
        !miniRoom.participantUserIds.includes(input.requestedByUserId)
      ) {
        return null
      }
      const completionIntent = miniRoom.completionIntent ?? {
        rewardDate: input.rewardDate,
        requestedAt: input.requestedAt,
        requestedByUserId: input.requestedByUserId
      }
      store.miniRooms.set(input.miniRoomId, {
        ...miniRoom,
        participantUserIds: [...miniRoom.participantUserIds] as [string, string],
        completionIntent: { ...completionIntent }
      })
      return { ...completionIntent }
    },
    async endMiniRoom(miniRoomId, endedByUserId, endedAt) {
      const miniRoom = store.miniRooms.get(miniRoomId)
      if (!miniRoom || miniRoom.endedAt) return null
      const endedRoom: MiniRoomRecord = {
        ...miniRoom,
        participantUserIds: [...miniRoom.participantUserIds] as [string, string],
        endedAt,
        endedByUserId
      }
      store.miniRooms.set(miniRoomId, cloneMiniRoom(endedRoom))
      return cloneMiniRoom(endedRoom)
    },
    async separateUserPair(input) {
      for (const [inviteId, invite] of store.invites) {
        if (
          invite.status === "pending" &&
          isPair(invite.senderUserId, invite.recipientUserId, input.actorUserId, input.otherUserId)
        ) {
          store.invites.set(inviteId, {
            ...invite,
            status: "cancelled",
            decidedAt: input.endedAt
          })
        }
      }
      const ended: MiniRoomRecord[] = []
      for (const [miniRoomId, miniRoom] of store.miniRooms) {
        if (
          !miniRoom.endedAt &&
          isPair(
            miniRoom.participantUserIds[0],
            miniRoom.participantUserIds[1],
            input.actorUserId,
            input.otherUserId
          )
        ) {
          const updated = {
            ...miniRoom,
            endedAt: input.endedAt,
            endedByUserId: input.actorUserId
          }
          store.miniRooms.set(miniRoomId, cloneMiniRoom(updated))
          ended.push(cloneMiniRoom(updated))
        }
      }
      return ended
    }
  }
}

function expireThreadInvites(
  store: InMemoryMiniRoomStore,
  sourceThreadId: string,
  now: Date
): void {
  for (const [inviteId, invite] of store.invites) {
    if (
      invite.sourceThreadId === sourceThreadId &&
      invite.status === "pending" &&
      invite.expiresAt &&
      Date.parse(invite.expiresAt) <= now.getTime()
    ) {
      store.invites.set(inviteId, {
        ...invite,
        status: "expired",
        decidedAt: now.toISOString()
      })
    }
  }
}

function hydrateInviteWithRoom(
  store: InMemoryMiniRoomStore,
  invite: MiniRoomInviteRecord
): MiniRoomInviteRecord {
  const roomSessionId = [...store.roomInviteIds.entries()].find(
    ([, inviteId]) => inviteId === invite.inviteId
  )?.[0]
  return {
    ...cloneInvite(invite),
    ...(roomSessionId ? { roomSessionId } : {})
  }
}

function isPair(
  first: string,
  second: string,
  userA: string,
  userB: string
): boolean {
  return (
    (first === userA && second === userB) ||
    (first === userB && second === userA)
  )
}

export function cloneInvite(invite: MiniRoomInviteRecord): MiniRoomInviteRecord {
  return { ...invite }
}

export function cloneMiniRoom(miniRoom: MiniRoomRecord): MiniRoomRecord {
  return {
    ...miniRoom,
    participantUserIds: [...miniRoom.participantUserIds] as [string, string],
    ...(miniRoom.sharedDecor ? { sharedDecor: {
      ...miniRoom.sharedDecor,
      decor: {
        ...miniRoom.sharedDecor.decor,
        ...(miniRoom.sharedDecor.decor.migration ? { migration: { ...miniRoom.sharedDecor.decor.migration } } : {}),
        placedItems: miniRoom.sharedDecor.decor.placedItems.map((item) => ({ ...item }))
      }
    } } : {}),
    ...(miniRoom.completionIntent
      ? { completionIntent: { ...miniRoom.completionIntent } }
      : {})
  }
}
