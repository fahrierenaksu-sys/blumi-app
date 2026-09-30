import { useCallback, useRef, useState } from "react"
import type { LayoutChangeEvent, View } from "react-native"
import type { StageWindowBounds } from "./roomEditorPlacementModel"

/**
 * Stage size and window position. Pointer mapping uses the measured window
 * bounds so drags track the room surface, not the touched furniture child.
 */
export function useRoomEditorStageLayout() {
  const stageRef = useRef<View | null>(null)
  const [roomLayout, setRoomLayout] = useState({ width: 0, height: 0 })
  const [stageWindowBounds, setStageWindowBounds] = useState<StageWindowBounds | undefined>()

  const measureStageWindow = useCallback(() => {
    stageRef.current?.measureInWindow((x, y, width, height) => {
      setStageWindowBounds((current) =>
        current &&
        current.x === x &&
        current.y === y &&
        current.width === width &&
        current.height === height
          ? current
          : { x, y, width, height }
      )
    })
  }, [])

  const handleRoomLayout = useCallback((e: LayoutChangeEvent) => {
    const nextLayout = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height
    }
    setRoomLayout((current) =>
      current.width === nextLayout.width &&
      current.height === nextLayout.height
        ? current
        : nextLayout
    )
    requestAnimationFrame(measureStageWindow)
  }, [measureStageWindow])

  return {
    stageRef,
    roomLayout,
    stageWindowBounds,
    measureStageWindow,
    handleRoomLayout
  }
}

export type RoomEditorStageLayout = ReturnType<typeof useRoomEditorStageLayout>
