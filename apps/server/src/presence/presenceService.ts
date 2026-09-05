import type {
  JoinRoomResponse,
  NearbyUser,
  PresenceUser,
  RoomPresenceSnapshot,
  UserProfile
} from "@blumi/contracts"
import {
  cloneCompleteAvatarSelection,
  normalizeStoredAvatarSelection
} from "../avatar/avatarSelectionPersistence"
import {
  canOccupySpot,
  getFirstAvailableSpot,
  getNearbyUsers
} from "@blumi/domain"
import type { RoomService } from "../rooms/roomService"
import {
  createInMemoryPresenceRepository,
  type PresenceRecord,
  type PresenceRepository
} from "./presenceRepository"

const PRESENCE_LEASE_MS = 1000 * 60

export interface PresenceService {
  repository: PresenceRepository
  joinRoom(input: JoinRoomInput, now?: Date): Promise<JoinRoomResponse>
  leaveRoom(roomId: string, userId: string): Promise<void>
  leaveAllRooms(userId: string): Promise<void>
  moveToSpot(
    roomId: string,
    userId: string,
    spotId: string,
    now?: Date
  ): Promise<RoomPresenceSnapshot>
  createSnapshot(roomId: string, now?: Date): Promise<RoomPresenceSnapshot>
  listNearbyUsers(
    roomId: string,
    userId: string,
    blockedUserIds?: readonly string[],
    now?: Date
  ): Promise<NearbyUser[]>
  findUserPresence(
    roomId: string,
    userId: string,
    now?: Date
  ): Promise<PresenceRecord | null>
  findUserPresenceAcrossRooms(
    userId: string,
    now?: Date
  ): Promise<PresenceRecord | null>
  setMiniRoomStatus(userIds: readonly string[], inMiniRoom: boolean): Promise<void>
}

export interface JoinRoomInput {
  roomId: string
  profile: UserProfile
  initialSpotId?: string
}

export interface CreatePresenceServiceOptions {
  repository?: PresenceRepository
  roomService: RoomService
}

export function createPresenceService(
  options: CreatePresenceServiceOptions
): PresenceService {
  const repository = options.repository ?? createInMemoryPresenceRepository()
  const roomService = options.roomService

  return {
    repository,
    async joinRoom(input, now = new Date()) {
      const layout = await roomService.getOrCreateLayout(input.roomId)
      const existingUsers = toPresenceUsers(
        await repository.listRoomPresence(layout.roomId, now)
      )
      const requestedSpotId = input.initialSpotId?.trim()
      const assignedSpotId =
        requestedSpotId && canOccupySpot(layout, existingUsers, requestedSpotId, input.profile.userId)
          ? requestedSpotId
          : getFirstAvailableSpot(layout, existingUsers)

      if (!assignedSpotId) {
        throw new Error("That room is full right now.")
      }

      const previousPresence = await repository.findUserPresence(
        layout.roomId,
        input.profile.userId,
        now
      )
      const avatar = normalizeStoredAvatarSelection({
        presetId: input.profile.avatar.presetId,
        loadout: input.profile.avatar.loadout,
        revision: input.profile.avatar.revision
      })
      const record: PresenceRecord = {
        roomId: layout.roomId,
        userId: input.profile.userId,
        displayName: input.profile.displayName,
        avatar,
        spotId: assignedSpotId,
        inMiniRoom: previousPresence?.inMiniRoom ?? false,
        joinedAt: previousPresence?.joinedAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + PRESENCE_LEASE_MS).toISOString()
      }
      await repository.savePresence(record)
      const snapshot = await this.createSnapshot(layout.roomId, now)

      return {
        roomId: layout.roomId,
        currentUserId: input.profile.userId,
        assignedSpotId,
        layout,
        snapshot
      }
    },
    async leaveRoom(roomId, userId) {
      await repository.deletePresence(roomId, userId)
    },
    async leaveAllRooms(userId) {
      await repository.deleteUserPresence(userId)
    },
    async moveToSpot(roomId, userId, spotId, now = new Date()) {
      const layout = await roomService.getOrCreateLayout(roomId)
      const current = await repository.findUserPresence(roomId, userId, now)
      if (!current) {
        throw new Error("Join the room first.")
      }

      const users = toPresenceUsers(await repository.listRoomPresence(roomId, now))
      if (!canOccupySpot(layout, users, spotId, userId)) {
        throw new Error("That spot is not available.")
      }

      await repository.savePresence({
        ...current,
        spotId,
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + PRESENCE_LEASE_MS).toISOString()
      })
      return this.createSnapshot(roomId, now)
    },
    async createSnapshot(roomId, now = new Date()) {
      return {
        roomId,
        users: toPresenceUsers(await repository.listRoomPresence(roomId, now)),
        updatedAt: now.toISOString()
      }
    },
    async listNearbyUsers(roomId, userId, blockedUserIds = [], now = new Date()) {
      const layout = await roomService.getOrCreateLayout(roomId)
      const users = toPresenceUsers(await repository.listRoomPresence(roomId, now))
      return getNearbyUsers(layout, users, userId, blockedUserIds)
    },
    async findUserPresence(roomId, userId, now = new Date()) {
      return repository.findUserPresence(roomId, userId, now)
    },
    async findUserPresenceAcrossRooms(userId, now = new Date()) {
      return repository.findUserPresenceAcrossRooms(userId, now)
    },
    async setMiniRoomStatus(userIds, inMiniRoom) {
      await repository.updateMiniRoomStatus(userIds, inMiniRoom)
    }
  }
}

function toPresenceUsers(records: PresenceRecord[]): PresenceUser[] {
  return records.map((record) => ({
    userId: record.userId,
    displayName: record.displayName,
    avatar: cloneCompleteAvatarSelection(record.avatar),
    spotId: record.spotId,
    inMiniRoom: record.inMiniRoom
  }))
}
