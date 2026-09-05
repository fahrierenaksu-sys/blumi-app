import type { RoomLayout } from "@blumi/contracts"
import {
  createInMemoryRoomRepository,
  type RoomRepository
} from "./roomRepository"

export const PUBLIC_LOBBY_ROOM_ID = "public-lobby"

const PUBLIC_LOBBY_LAYOUT: RoomLayout = {
  roomId: PUBLIC_LOBBY_ROOM_ID,
  proximityRadius: 180,
  spots: [
    { spotId: "seat-left", kind: "seat", x: 120, y: 220, label: "Left seat" },
    { spotId: "seat-right", kind: "seat", x: 260, y: 220, label: "Right seat" },
    { spotId: "hotspot-bar", kind: "hotspot", x: 190, y: 120, label: "Bar" },
    { spotId: "hotspot-window", kind: "hotspot", x: 80, y: 80, label: "Window" },
    { spotId: "hotspot-stage", kind: "hotspot", x: 300, y: 90, label: "Stage" },
    { spotId: "seat-corner", kind: "seat", x: 350, y: 250, label: "Corner" }
  ]
}

export interface RoomService {
  repository: RoomRepository
  getOrCreateLayout(roomId: string): Promise<RoomLayout>
}

export interface CreateRoomServiceOptions {
  repository?: RoomRepository
}

export function createRoomService(
  options: CreateRoomServiceOptions = {}
): RoomService {
  const repository = options.repository ?? createInMemoryRoomRepository()

  return {
    repository,
    async getOrCreateLayout(roomId) {
      const normalizedRoomId = normalizeRoomId(roomId)
      const existing = await repository.findLayout(normalizedRoomId)
      if (existing) return existing

      if (normalizedRoomId !== PUBLIC_LOBBY_ROOM_ID) {
        throw new Error("That room is not available.")
      }

      await repository.saveLayout(PUBLIC_LOBBY_LAYOUT)
      return {
        ...PUBLIC_LOBBY_LAYOUT,
        spots: PUBLIC_LOBBY_LAYOUT.spots.map((spot) => ({ ...spot }))
      }
    }
  }
}

function normalizeRoomId(roomId: string): string {
  const trimmed = roomId.trim()
  if (!trimmed) {
    throw new Error("Choose a room first.")
  }
  return trimmed
}
