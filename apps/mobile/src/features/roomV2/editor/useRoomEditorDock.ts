import { useCallback, useState } from "react"
import type { LayoutChangeEvent } from "react-native"
import type { RoomEditorStageZoom } from "./roomEditorDockModel"

/**
 * Presentation state of the floating-dock editor: compact or expanded dock,
 * the room zoom, the measured stage area, and the tray piece the user picked
 * (as opposed to the inspector's default entry).
 */
export function useRoomEditorDock() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [zoom, setZoom] = useState<RoomEditorStageZoom>("fill")
  const [pickedTrayItemId, setPickedTrayItemId] = useState<string | undefined>()
  const [stageArea, setStageArea] = useState({ width: 0, height: 0 })

  const toggleExpanded = useCallback(() => {
    setIsExpanded((current) => !current)
  }, [])
  const toggleZoom = useCallback(() => {
    setZoom((current) => (current === "fill" ? "fit" : "fill"))
  }, [])
  const handleStageAreaLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setStageArea((current) =>
      current.width === width && current.height === height ? current : { width, height }
    )
  }, [])

  return {
    isExpanded,
    toggleExpanded,
    zoom,
    toggleZoom,
    pickedTrayItemId,
    setPickedTrayItemId,
    stageArea,
    handleStageAreaLayout
  }
}

export type RoomEditorDockState = ReturnType<typeof useRoomEditorDock>
