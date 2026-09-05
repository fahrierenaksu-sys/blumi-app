import type { RoomLayout } from "@blumi/contracts"

export interface RoomRepository {
  findLayout(roomId: string): Promise<RoomLayout | null>
  saveLayout(layout: RoomLayout): Promise<void>
}

export interface InMemoryRoomStore {
  layouts: Map<string, RoomLayout>
}

export function createInMemoryRoomStore(): InMemoryRoomStore {
  return {
    layouts: new Map()
  }
}

export function createInMemoryRoomRepository(
  store: InMemoryRoomStore = createInMemoryRoomStore()
): RoomRepository {
  return {
    async findLayout(roomId) {
      const layout = store.layouts.get(roomId)
      return layout ? cloneLayout(layout) : null
    },
    async saveLayout(layout) {
      store.layouts.set(layout.roomId, cloneLayout(layout))
    }
  }
}

export function cloneLayout(layout: RoomLayout): RoomLayout {
  return {
    ...layout,
    spots: layout.spots.map((spot) => ({ ...spot }))
  }
}
