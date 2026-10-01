import type { ClientEvent, MiniRoomAvatarMotion, ServerEvent } from "@blumi/contracts"

export interface MiniRoomMotionState {
  /**
   * Latest authoritative record of every participant (empty until the scene is
   * joined). Always complete, so React rendering only the last of several
   * updates in a burst can never lose a step.
   */
  avatars: MiniRoomAvatarMotion[]
  /** A new value for each join snapshot: the scene then places both avatars exactly. */
  snapKey: number
  partnerPresent: boolean
  /**
   * The server refused this phone's latest seat claim (the partner got there
   * first). The scene walks the local avatar beside the seat once per revision.
   */
  seatRefusal?: { revision: number; hotspotId: string }
  /** The same account entered this room on another device, which now drives the avatar. */
  superseded?: boolean
}

const RETARGET_INTERVAL_MS = 200
/** An unanswered scene entry is sent again; without its snapshot the avatar cannot walk. */
const SCENE_ENTER_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const
let lastSnapKey = 0

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
  let active = false, ready = false, sequence = 0, epoch: string | null = null, lastSent = -Infinity
  let snapKey = 0, enterAttempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let enterTimer: ReturnType<typeof setTimeout> | undefined
  let pending: { x: number; y: number; hotspotId?: string } | undefined
  let lastSentTarget: { x: number; y: number; hotspotId?: string } | undefined
  let seatRefusal: MiniRoomMotionState["seatRefusal"]
  let superseded = false
  const avatars = new Map<string, MiniRoomAvatarMotion>()
  const clearPending = () => { if (timer !== undefined) cancel(timer); timer = undefined; pending = undefined }
  const clearEnterRetry = () => { if (enterTimer !== undefined) cancel(enterTimer); enterTimer = undefined }
  const publish = () => input.update({ avatars: [...avatars.values()], snapKey,
    partnerPresent: avatars.get(input.partnerUserId)?.present ?? false,
    ...(seatRefusal ? { seatRefusal } : {}), ...(superseded ? { superseded } : {}) })
  /**
   * A refusal corrects the local avatar only while that claim is still this
   * phone's newest intent; a later tap (sent or coalescing) gets its own answer.
   */
  const isRefusalOfLatestIntent = (avatar: MiniRoomAvatarMotion) =>
    avatar.userId === input.localUserId && !avatar.hotspotId && Boolean(avatar.deniedHotspotId) &&
    !pending && lastSentTarget !== undefined && lastSentTarget.hotspotId === avatar.deniedHotspotId &&
    lastSentTarget.x === avatar.x && lastSentTarget.y === avatar.y
  const enter = () => {
    input.send({ type: "mini_room.scene_enter", payload: { miniRoomId: input.miniRoomId } })
    const delay = SCENE_ENTER_RETRY_DELAYS_MS[Math.min(enterAttempts++, SCENE_ENTER_RETRY_DELAYS_MS.length - 1)]
    enterTimer = schedule(() => {
      enterTimer = undefined
      if (active && !ready) enter()
    }, delay)
  }
  const flush = () => {
    timer = undefined
    if (!ready || !pending) return
    const target = pending; pending = undefined
    lastSent = now(); lastSentTarget = target
    input.send({ type: "mini_room.move", payload: { miniRoomId: input.miniRoomId, sequence: ++sequence, ...target } })
  }
  return {
    connect() {
      clearPending(); clearEnterRetry()
      active = true; ready = false; epoch = null; avatars.clear(); sequence = 0; lastSent = -Infinity; enterAttempts = 0
      lastSentTarget = undefined; seatRefusal = undefined; superseded = false
      enter()
    },
    disconnect() {
      clearPending(); clearEnterRetry(); active = false; ready = false
      input.update({ avatars: [], snapKey, partnerPresent: false })
    },
    leave() {
      this.disconnect()
      input.send({ type: "mini_room.scene_exit", payload: { miniRoomId: input.miniRoomId } })
    },
    move(point: { x: number; y: number }, hotspotId?: string) {
      if (!ready) return false
      pending = { ...point, ...(hotspotId ? { hotspotId } : {}) }
      const delay = Math.max(0, RETARGET_INTERVAL_MS - (now() - lastSent))
      if (delay === 0) { if (timer !== undefined) cancel(timer); flush() }
      else if (timer === undefined) timer = schedule(flush, delay)
      return true
    },
    receive(event: ServerEvent) {
      if (!active) return
      if (event.type === "mini_room.scene_superseded") {
        if (event.payload.miniRoomId !== input.miniRoomId) return
        // The server already removed this socket from the scene: stop sending.
        clearPending(); clearEnterRetry(); active = false; ready = false; superseded = true
        publish()
        return
      }
      if (event.type !== "mini_room.motion_snapshot" && event.type !== "mini_room.avatar_moved") return
      const payload = event.payload
      if (payload.miniRoomId !== input.miniRoomId ||
        !payload.participantUserIds.includes(input.localUserId) ||
        !payload.participantUserIds.includes(input.partnerUserId)) return
      const incoming = event.type === "mini_room.motion_snapshot" ? event.payload.avatars : [event.payload.avatar]
      if (epoch === null) {
        // Join on the snapshot that answers this socket's entry. An earlier one,
        // caused by the partner, would start steps the server still ignores.
        if (event.type !== "mini_room.motion_snapshot" ||
          !incoming.some(avatar => avatar.userId === input.localUserId && avatar.present)) return
        epoch = payload.epoch; ready = true; snapKey = ++lastSnapKey
        clearEnterRetry()
        for (const avatar of incoming) avatars.set(avatar.userId, avatar)
        publish()
        return
      }
      if (payload.epoch !== epoch) return
      let changed = false
      for (const avatar of incoming) {
        if (!payload.participantUserIds.includes(avatar.userId) ||
          avatar.revision <= (avatars.get(avatar.userId)?.revision ?? -1)) continue
        avatars.set(avatar.userId, avatar)
        if (isRefusalOfLatestIntent(avatar)) seatRefusal = { revision: avatar.revision, hotspotId: avatar.deniedHotspotId! }
        changed = true
      }
      if (changed) publish()
    }
  }
}
