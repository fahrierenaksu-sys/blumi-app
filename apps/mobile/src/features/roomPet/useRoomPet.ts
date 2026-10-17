import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { RoomPoint2D, RoomV2FurnitureRenderItem, RoomV2RenderItem } from "../roomV2/roomV2.types"
import type { RoomV2FloorGridProjection } from "../roomV2/roomV2FloorGrid"
import type { RoomPetAvatar, RoomPetEvent, RoomPetMap, RoomPetState } from "./roomPet.types"
import { createRoomPetState, stepRoomPet } from "./roomPetEngine"
import { createRoomPetMapFromRoom, getRoomPetCellAtStagePoint, type RoomPetVisibleStage } from "./roomPetRoomAdapter"
import { getRoomPetNextWakeMs, getRoomPetOwnerEvents, resolveRoomPetDraw, type RoomPetDraw } from "./roomPetRoomScene"

/**
 * The owner's live position is read this often while the pet is otherwise
 * waiting, so a walking avatar finds the pet already stepping aside. This is
 * an event timer, not a frame loop: React renders only when the drawing changes.
 */
const ROOM_PET_OWNER_WATCH_MS = 250

export interface RoomPetOwnerSnapshot {
  readonly point: RoomPoint2D
  readonly seatFurnitureId: string | null
}

export interface UseRoomPetInput {
  readonly isEnabled: boolean
  readonly isActive: boolean
  readonly projection: RoomV2FloorGridProjection | null
  readonly furniture: readonly RoomV2FurnitureRenderItem[]
  readonly renderItems: readonly RoomV2RenderItem[]
  /** The part of the shell the screen shows; the pet never walks outside it. Unset: the whole shell. */
  readonly visibleStage?: RoomPetVisibleStage
  /** The owner's avatar as it is now (live walk point included); null when it is not in the room. */
  readonly readOwner: () => RoomPetOwnerSnapshot | null
}

export interface RoomPetController {
  readonly draw: RoomPetDraw | null
  readonly tap: () => void
}

function isSameDraw(a: RoomPetDraw | null, b: RoomPetDraw | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.foot.x === b.foot.x && a.foot.y === b.foot.y && a.clip === b.clip && a.heading === b.heading &&
    a.mirrored === b.mirrored && a.emote === b.emote && a.beforeRenderId === b.beforeRenderId && a.moveMs === b.moveMs
}

function createSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

/**
 * Runs the room pet in the owner's own room: builds its map from the room,
 * steps the engine when it has something to do or the owner moved, and
 * returns what to draw. Off (null drawing, no timers) unless enabled.
 */
export function useRoomPet(input: UseRoomPetInput): RoomPetController {
  const { isEnabled, isActive, projection, furniture, renderItems, readOwner } = input
  const visibleMinX = input.visibleStage?.minX
  const visibleMaxX = input.visibleStage?.maxX
  const petHalfWidth = input.visibleStage?.petHalfWidth
  const map = useMemo<RoomPetMap | null>(() => {
    if (!isEnabled || !projection) return null
    const visibleStage = visibleMinX !== undefined && visibleMaxX !== undefined && petHalfWidth !== undefined
      ? { minX: visibleMinX, maxX: visibleMaxX, petHalfWidth }
      : undefined
    const built = createRoomPetMapFromRoom({ projection, furniture, visibleStage })
    return built.cells.length > 0 ? built : null
  }, [furniture, isEnabled, petHalfWidth, projection, visibleMaxX, visibleMinX])
  const [draw, setDraw] = useState<RoomPetDraw | null>(null)
  const stateRef = useRef<RoomPetState | null>(null)
  const ownerRef = useRef<RoomPetAvatar | null>(null)
  const pendingEventsRef = useRef<RoomPetEvent[]>([])
  const readOwnerRef = useRef(readOwner)
  readOwnerRef.current = readOwner
  const renderItemsRef = useRef(renderItems)
  renderItemsRef.current = renderItems
  // React renders only when the drawing changes (a step, a clip, a new place in the draw order).
  const publish = useCallback((): void => {
    const next = resolveRoomPetDraw({ isEnabled, projection, map, state: stateRef.current, renderItems: renderItemsRef.current })
    setDraw((previous) => (isSameDraw(previous, next) ? previous : next))
  }, [isEnabled, map, projection])
  const [wakeSignal, setWakeSignal] = useState(0)

  // A new map (furniture moved) keeps the pet where it stands when that cell is still free.
  useEffect(() => {
    if (!map) {
      stateRef.current = null
      ownerRef.current = null
      publish()
      return
    }
    const previous = stateRef.current
    const created = createRoomPetState({
      map,
      seed: createSeed(),
      nowMs: Date.now(),
      ...(previous ? { cell: previous.cell, bondMs: previous.bondMs } : {})
    })
    stateRef.current = created
    ownerRef.current = null
    publish()
  }, [map, publish])

  useEffect(() => {
    publish()
  }, [publish, renderItems])

  useEffect(() => {
    if (!map || !projection || !isActive) return undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false
    const tick = (): void => {
      const current = stateRef.current
      if (isCancelled || !current) return
      const nowMs = Date.now()
      const ownerSnapshot = readOwnerRef.current()
      const owner: RoomPetAvatar | null = ownerSnapshot
        ? { cell: getRoomPetCellAtStagePoint(projection, ownerSnapshot.point), seatFurnitureId: ownerSnapshot.seatFurnitureId }
        : null
      const events = [...getRoomPetOwnerEvents(ownerRef.current, owner), ...pendingEventsRef.current]
      ownerRef.current = owner
      pendingEventsRef.current = []
      const next = stepRoomPet(current, map, { nowMs, events })
      stateRef.current = next
      publish()
      const wakeAtMs = getRoomPetNextWakeMs(next)
      const delayMs = Math.min(ROOM_PET_OWNER_WATCH_MS, wakeAtMs === null ? ROOM_PET_OWNER_WATCH_MS : Math.max(0, wakeAtMs - nowMs))
      timer = setTimeout(tick, delayMs)
    }
    tick()
    return () => {
      isCancelled = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [isActive, map, projection, publish, wakeSignal])

  const tap = useCallback((): void => {
    if (!stateRef.current) return
    pendingEventsRef.current = [...pendingEventsRef.current, { type: "tap" }]
    setWakeSignal((value) => value + 1)
  }, [])

  return useMemo(() => ({ draw, tap }), [draw, tap])
}
