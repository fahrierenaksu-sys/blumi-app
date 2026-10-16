import { useCallback, useMemo } from "react"

import { useIsSurfaceFocused } from "../avatar/components/useIsSurfaceFocused"
import type { RoomShell, RoomV2FurnitureRenderItem, RoomV2RenderItem } from "../roomV2/roomV2.types"
import { getRoomV2FloorGridProjection } from "../roomV2/roomV2FloorGrid"
import type { RoomRendererDepthSlot } from "../roomV2/components/roomRendererDepthSlot"
import { ROOM_PET_CAT_WHITE_SHEET } from "./sheet/roomPetCatWhiteSheetSource"
import { IS_BLUMI_ROOM_PET_ENABLED } from "./roomPetFlag"
import { ROOM_PET_RENDER_ID } from "./roomPetRoomScene"
import { RoomPetFlipbook } from "./RoomPetFlipbook"
import { useRoomPet, type RoomPetOwnerSnapshot } from "./useRoomPet"

/**
 * The room pet in My Room (P1: own room only), as one depth slot for the room
 * renderer. Undefined while EXPO_PUBLIC_BLUMI_ROOM_PET is off: no map, no
 * timers, nothing drawn. Draws the approved white cat sheet.
 */
export function useMyRoomPetSlot(input: {
  readonly shell: RoomShell | null
  readonly sceneItems: readonly RoomV2RenderItem[]
  readonly renderItems: readonly RoomV2RenderItem[]
  readonly isReady: boolean
  readonly readOwner: () => RoomPetOwnerSnapshot | null
  readonly isEnabled?: boolean
  readonly testID?: string
}): RoomRendererDepthSlot | undefined {
  const { shell, sceneItems, renderItems, isReady, readOwner, testID } = input
  const isEnabled = input.isEnabled ?? IS_BLUMI_ROOM_PET_ENABLED
  const isFocused = useIsSurfaceFocused()
  const floorGrid = shell?.floorGrid
  const projection = useMemo(
    () => (isEnabled && floorGrid ? getRoomV2FloorGridProjection(floorGrid) : null),
    [floorGrid, isEnabled]
  )
  const furniture = useMemo(
    () => sceneItems.filter((item): item is RoomV2FurnitureRenderItem => item.kind === "furniture"),
    [sceneItems]
  )
  const pet = useRoomPet({ isEnabled, isActive: isFocused && isReady, projection, furniture, renderItems, readOwner })
  const { draw, tap } = pet
  const handleTap = useCallback(() => tap(), [tap])
  const canvasSize = shell?.canvasSize
  return useMemo(() => {
    if (!draw || !canvasSize) return undefined
    return {
      beforeRenderId: draw.beforeRenderId,
      node: (
        <RoomPetFlipbook
          draw={draw}
          sheet={ROOM_PET_CAT_WHITE_SHEET}
          canvasSize={canvasSize}
          onTap={handleTap}
          testID={testID ? `${testID}-${ROOM_PET_RENDER_ID}` : undefined}
        />
      )
    }
  }, [canvasSize, draw, handleTap, testID])
}
