import { useCallback, useEffect, useRef } from "react"
import type { RoomV2RenderItem } from "../roomV2.types"

/** What a room scene draws before it counts as complete. */
export const ROOM_SCENE_SHELL_KEY = "shell"

export function getRoomSceneItemKey(item: Pick<RoomV2RenderItem, "kind" | "renderId">): string {
  return `${item.kind}:${item.renderId}`
}

export function getRoomSceneShadowKey(renderId: string): string {
  return `shadow:${renderId}`
}

/**
 * The images a renderer must have on screen before its scene is complete: the
 * shell, every furniture image and avatar it draws, and every contact shadow
 * it draws. Items another layer draws (`hiddenRenderIds`) are that layer's.
 */
export function getRoomSceneReadinessKeys(input: {
  renderItems: readonly RoomV2RenderItem[]
  hiddenRenderIds?: ReadonlySet<string>
  drawsContactShadows: boolean
}): string[] {
  const keys = [ROOM_SCENE_SHELL_KEY]
  for (const item of input.renderItems) {
    if (input.drawsContactShadows && item.kind === "furniture" && item.contactShadowAsset) {
      keys.push(getRoomSceneShadowKey(item.renderId))
    }
    if ((item.kind === "furniture" || item.kind === "avatar") && !input.hiddenRenderIds?.has(item.renderId)) {
      keys.push(getRoomSceneItemKey(item))
    }
  }
  return keys
}

export function isRoomSceneComplete(required: readonly string[], drawn: ReadonlySet<string>): boolean {
  return required.every((key) => drawn.has(key))
}

/**
 * Reports `onSceneReady` once per mount, the first time every required image
 * has drawn. Returns the callback images report to (`undefined` without a
 * listener, so items render exactly as before). A key that is no longer
 * required (an item removed while loading) stops blocking at once.
 */
export function useRoomSceneReadiness(
  requiredKeys: readonly string[],
  onSceneReady: (() => void) | undefined
): ((key: string) => void) | undefined {
  const drawnRef = useRef(new Set<string>())
  const requiredRef = useRef(requiredKeys)
  const readyRef = useRef(false)
  const listenerRef = useRef(onSceneReady)
  const check = useCallback(() => {
    if (readyRef.current || !isRoomSceneComplete(requiredRef.current, drawnRef.current)) return
    readyRef.current = true
    listenerRef.current?.()
  }, [])
  const requiredSignature = requiredKeys.join("\n")
  useEffect(() => {
    listenerRef.current = onSceneReady
    requiredRef.current = requiredSignature ? requiredSignature.split("\n") : []
    check()
  }, [check, onSceneReady, requiredSignature])
  const markDrawn = useCallback((key: string) => {
    if (drawnRef.current.has(key)) return
    drawnRef.current.add(key)
    check()
  }, [check])
  return onSceneReady ? markDrawn : undefined
}
