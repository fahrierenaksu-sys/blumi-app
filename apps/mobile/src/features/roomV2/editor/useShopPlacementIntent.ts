import { useEffect, useRef, type RefObject } from "react"
import { hapticSuccess } from "../../../ui/haptics"
import type { MyRoomEditorNavigation } from "./roomEditorCatalog"

/**
 * Remembers the last Shop placement intent applied by this editor instance and
 * forgets it on blur, so a reused route applies each product ID only once per
 * visit. Call first so the blur listener registers before the editor effects.
 */
export function useShopPlacementIntentMemory(
  navigation: MyRoomEditorNavigation
): RefObject<string | undefined> {
  const lastAppliedPlacementItemId = useRef<string | undefined>(undefined)

  useEffect(() => navigation.addListener("blur", () => {
    lastAppliedPlacementItemId.current = undefined
  }), [navigation])

  return lastAppliedPlacementItemId
}

/**
 * Applies a Shop "place in room" intent once the draft and the authoritative
 * inventory are ready. Passive: a duplicate placement shows no error.
 */
export function useShopPlacementIntent(input: {
  placementItemId: string | undefined
  lastAppliedPlacementItemId: RefObject<string | undefined>
  canPlaceInventoryItem: boolean
  isRoomDraftReady: boolean
  addDraftItem: (itemId: string, feedback: boolean) => boolean
  setSelectedInventoryItemId: (itemId: string | undefined) => void
  setPlacementFeedback: (feedback: string | undefined) => void
}): void {
  const {
    placementItemId,
    lastAppliedPlacementItemId,
    canPlaceInventoryItem,
    isRoomDraftReady,
    addDraftItem,
    setSelectedInventoryItemId,
    setPlacementFeedback
  } = input

  useEffect(() => {
    if (!placementItemId || lastAppliedPlacementItemId.current === placementItemId) return
    if (!canPlaceInventoryItem || !isRoomDraftReady) return
    lastAppliedPlacementItemId.current = placementItemId
    setSelectedInventoryItemId(placementItemId)
    setPlacementFeedback(undefined)
    if (addDraftItem(placementItemId, false)) {
      hapticSuccess()
    }
  }, [
    addDraftItem,
    canPlaceInventoryItem,
    isRoomDraftReady,
    placementItemId,
    lastAppliedPlacementItemId,
    setSelectedInventoryItemId,
    setPlacementFeedback
  ])
}
