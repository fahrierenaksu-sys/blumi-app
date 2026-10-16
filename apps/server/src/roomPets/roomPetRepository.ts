export type RoomPetNameStatus = "active" | "reset"
export type RoomPetRoomState = "home" | "hidden"

/** The server's record of a member's room pet. Never trusted from a client. */
export interface RoomPetRecord {
  petId: string
  userId: string
  speciesItemId: string
  name: string
  nameStatus: RoomPetNameStatus
  roomState: RoomPetRoomState
  revision: number
  createdAt: string
  updatedAt: string
}

export interface NewRoomPet {
  petId: string
  userId: string
  speciesItemId: string
  name: string
  createdAt: string
}

export type AdoptRoomPetResult =
  | { outcome: "adopted"; pet: RoomPetRecord }
  | { outcome: "already_has_pet"; pet: RoomPetRecord }

export interface RoomPetRepository {
  findByUser(userId: string): Promise<RoomPetRecord | null>
  /** Inserts the member's first pet; one per member in P1, decided atomically. */
  adopt(pet: NewRoomPet): Promise<AdoptRoomPetResult>
  /** Renames the member's own pet; null when the member has none. */
  rename(userId: string, name: string, updatedAt: string): Promise<RoomPetRecord | null>
  /** Erases the member's pet (account deletion); returns the number of rows removed. */
  deleteByUser(userId: string): Promise<number>
}

export function createInMemoryRoomPetRepository(): RoomPetRepository {
  let byUser = new Map<string, RoomPetRecord>()

  return {
    async findByUser(userId) {
      return byUser.get(userId) ?? null
    },
    async adopt(input) {
      const existing = byUser.get(input.userId)
      if (existing) return { outcome: "already_has_pet", pet: existing }
      const pet: RoomPetRecord = {
        ...input,
        nameStatus: "active",
        roomState: "home",
        revision: 1,
        updatedAt: input.createdAt
      }
      byUser = new Map(byUser).set(input.userId, pet)
      return { outcome: "adopted", pet }
    },
    async rename(userId, name, updatedAt) {
      const existing = byUser.get(userId)
      if (!existing) return null
      const pet: RoomPetRecord = { ...existing, name, nameStatus: "active", revision: existing.revision + 1, updatedAt }
      byUser = new Map(byUser).set(userId, pet)
      return pet
    },
    async deleteByUser(userId) {
      if (!byUser.has(userId)) return 0
      const next = new Map(byUser)
      next.delete(userId)
      byUser = next
      return 1
    }
  }
}
