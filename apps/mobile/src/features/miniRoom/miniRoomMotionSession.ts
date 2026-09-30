import type { ClientEvent, MiniRoomAvatarMotion, ServerEvent } from "@blumi/contracts"

export interface MiniRoomMotionState {
  avatars: MiniRoomAvatarMotion[]
  snap: boolean
  partnerPresent: boolean
}

/** Target changes only, never animation frames. First target has no debounce. */
export function createMiniRoomMotionSession(input: {
  miniRoomId: string; localUserId: string; partnerUserId: string
  send(event: ClientEvent): boolean
  update(state: MiniRoomMotionState): void
  now?: () => number
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}) {
  const now = input.now ?? Date.now
  const schedule = input.schedule ?? setTimeout
  const cancel = input.cancel ?? clearTimeout
  let ready = false, sequence = 0, epoch: string | null = null, lastSent = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { x: number; y: number; hotspotId?: string } | undefined
  const avatars = new Map<string, MiniRoomAvatarMotion>()
  const clearPending = () => { if (timer !== undefined) cancel(timer); timer = undefined; pending = undefined }
  const flush = () => {
    timer = undefined
    if (!ready || !pending) return
    const target = pending; pending = undefined
    lastSent = now()
    input.send({ type: "mini_room.move", payload: { miniRoomId: input.miniRoomId, sequence: ++sequence, ...target } })
  }
  return {
    connect() {
      clearPending(); ready = false; epoch = null; avatars.clear(); sequence = 0; lastSent = -Infinity
      input.send({ type: "mini_room.scene_enter", payload: { miniRoomId: input.miniRoomId } })
    },
    disconnect() {
      clearPending(); ready = false
      input.update({ avatars: [], snap: false, partnerPresent: false })
    },
    leave() {
      this.disconnect()
      input.send({ type: "mini_room.scene_exit", payload: { miniRoomId: input.miniRoomId } })
    },
    move(point: { x: number; y: number }, hotspotId?: string) {
      if (!ready) return false
      pending = { ...point, ...(hotspotId ? { hotspotId } : {}) }
      const delay = Math.max(0, 200 - (now() - lastSent))
      if (delay === 0) { if (timer !== undefined) cancel(timer); flush() }
      else if (timer === undefined) timer = schedule(flush, delay)
      return true
    },
    receive(event: ServerEvent) {
      if (event.type !== "mini_room.motion_snapshot" && event.type !== "mini_room.avatar_moved") return
      const payload = event.payload
      if (payload.miniRoomId !== input.miniRoomId ||
        !payload.participantUserIds.includes(input.localUserId) ||
        !payload.participantUserIds.includes(input.partnerUserId)) return
      const initial = event.type === "mini_room.motion_snapshot" && epoch === null
      if (!initial && payload.epoch !== epoch) return
      if (initial) { epoch = payload.epoch; ready = true }
      const incoming = event.type === "mini_room.motion_snapshot" ? event.payload.avatars : [event.payload.avatar]
      const changed = incoming.filter(avatar =>
        payload.participantUserIds.includes(avatar.userId) &&
        avatar.revision > (avatars.get(avatar.userId)?.revision ?? -1))
      if (!changed.length) return
      for (const avatar of changed) avatars.set(avatar.userId, avatar)
      input.update({ avatars: changed, snap: initial,
        partnerPresent: avatars.get(input.partnerUserId)?.present ?? false })
    }
  }
}
