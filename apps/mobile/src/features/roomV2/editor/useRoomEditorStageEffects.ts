import { useCallback, useEffect, useRef, useState } from "react"
import { useMotion } from "../../../ui/motion"
import { getRoomSceneItemKey } from "../components/roomSceneReadiness"
import type { RoomV2FurnitureRenderItem } from "../roomV2.types"
import {
  getRoomEditorTurnHiddenRenderId,
  isRoomEditorTurnNudge,
  type RoomEditorStageEffect
} from "./roomEditorStageEffectModel"
import {
  ROOM_EDITOR_PLACE_JUICE,
  ROOM_EDITOR_SETTLE_HANDOFF_CAP_MS,
  ROOM_EDITOR_SETTLE_HANDOFF_MS
} from "./roomEditorPlaceMotion"

export type { RoomEditorStageEffect } from "./roomEditorStageEffectModel"

/**
 * The stage's reward beats (2.5D room only, and never under Reduce Motion): a sparkle where a drop
 * landed and a soft turn when a placed piece rotates (gliding to its new cell when the turn nudged it). The room
 * already holds the result; a beat only decorates it and leaves when its fixed timeline ends. While a piece turns
 * the room hides it, so only the turning drawings show; then the room draws it again under the turn's last frame
 * (identical), and the overlay goes once the room says the piece is on screen, or after a short cap. Pure client
 * state: nothing here reaches the draft or Save.
 */
export function useRoomEditorStageEffects() {
  const { reduceMotion } = useMotion()
  const [effect, setEffect] = useState<RoomEditorStageEffect | undefined>()
  const effectRef = useRef(effect)
  effectRef.current = effect
  const keyRef = useRef(0)
  const handOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOn = ROOM_EDITOR_PLACE_JUICE && !reduceMotion

  const clearHandOffTimer = useCallback(() => {
    if (handOffTimerRef.current !== null) clearTimeout(handOffTimerRef.current)
    handOffTimerRef.current = null
  }, [])

  const playSparkle = useCallback((item: RoomV2FurnitureRenderItem) => {
    if (!isOn) return
    clearHandOffTimer()
    keyRef.current += 1
    setEffect({ key: keyRef.current, kind: "sparkle", item })
  }, [clearHandOffTimer, isOn])

  const playTurn = useCallback((from: RoomV2FurnitureRenderItem, to: RoomV2FurnitureRenderItem) => {
    if (!isOn) return
    clearHandOffTimer()
    keyRef.current += 1
    setEffect({ key: keyRef.current, kind: "turn", from, to, nudged: isRoomEditorTurnNudge(from, to), phase: "turning" })
  }, [clearHandOffTimer, isOn])

  const finishEffect = useCallback((key: number) => {
    clearHandOffTimer()
    setEffect((current) => current?.key === key ? undefined : current)
  }, [clearHandOffTimer])

  // A beat's clock ended. A turn first hands the piece back to the room and waits for it to be drawn.
  const clearEffect = useCallback((key: number) => {
    const current = effectRef.current
    if (current?.key !== key) return
    if (current.kind !== "turn" || current.phase !== "turning") {
      finishEffect(key)
      return
    }
    setEffect({ ...current, phase: "handoff" })
    clearHandOffTimer()
    handOffTimerRef.current = setTimeout(() => finishEffect(key), ROOM_EDITOR_SETTLE_HANDOFF_CAP_MS)
  }, [clearHandOffTimer, finishEffect])

  // The room drew an item: if it is the piece a turn just handed back, the overlay can go one beat later.
  const handleItemDrawn = useCallback((drawnKey: string) => {
    const current = effectRef.current
    if (current?.kind !== "turn" || current.phase !== "handoff") return
    if (drawnKey !== getRoomSceneItemKey({ kind: "furniture", renderId: current.to.renderId })) return
    clearHandOffTimer()
    const key = current.key
    handOffTimerRef.current = setTimeout(() => finishEffect(key), ROOM_EDITOR_SETTLE_HANDOFF_MS)
  }, [clearHandOffTimer, finishEffect])

  useEffect(() => clearHandOffTimer, [clearHandOffTimer])

  return {
    effect,
    /** The piece the room hides while it turns (its turning drawings stand in for it). */
    hiddenRenderId: getRoomEditorTurnHiddenRenderId(effect),
    playSparkle,
    playTurn,
    clearEffect,
    handleItemDrawn
  }
}

export type RoomEditorStageEffects = ReturnType<typeof useRoomEditorStageEffects>
