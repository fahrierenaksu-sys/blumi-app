import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { UserAvatar } from "../../avatarV2/avatarV2.types"
import { publishSelectedShopPreviewWarmup } from "../../performance/sceneAssetWarmupModel"
import { goBackOrFallback } from "../../../navigation/rootNavigationModel"
import type { RootStackParamList } from "../../../navigation/RootNavigator"
import { avatarToShopCombinationDraft } from "../shopAvatarDraft"
import {
  createShopCombinationState,
  isEquippedSyncPending,
  reduceShopCombination,
  type ShopAvatarRevision,
  type ShopCombinationDraft,
  type ShopCombinationAction,
  type ShopCombinationCommand,
  type ShopCombinationState
} from "../shopCombinationState"

/**
 * Owns the Shop's combination state machine and its exit rules: navigation
 * away is blocked while a purchase/save runs, and a discard always drops
 * the draft preview. `combinationStateRef` mirrors the latest transition
 * synchronously so async purchase steps never read a stale render.
 */
export function useShopCombinationSession(input: {
  navigation: NativeStackNavigationProp<RootStackParamList, "CosmeticShop">
  avatar: UserAvatar
  ownedAvatarItemIds: readonly string[]
  avatarRevision: ShopAvatarRevision
}) {
  const { navigation } = input
  const [combinationState, setCombinationState] = useState<ShopCombinationState>(
    () => createShopCombinationState({
      equipped: avatarToShopCombinationDraft(input.avatar),
      ownedProductIds: input.ownedAvatarItemIds,
      avatarRevision: input.avatarRevision
    })
  )
  const combinationStateRef = useRef(combinationState)

  const dispatchCombination = useCallback((
    action: ShopCombinationAction,
    baseState: ShopCombinationState = combinationStateRef.current
  ): readonly ShopCombinationCommand[] => {
    const transition = reduceShopCombination(baseState, action)
    combinationStateRef.current = transition.state
    setCombinationState(transition.state)
    return transition.commands
  }, [])

  // The wardrobe (or another surface) can save a new look while the Shop stays
  // mounted; without this the Shop keeps drawing the look it mounted with.
  // The draft holds only strings, nulls and an id array, so its serialized key
  // round-trips exactly; parsing it gives a value that changes only with the look.
  const equippedKey = JSON.stringify(avatarToShopCombinationDraft(input.avatar))
  const equipped = useMemo(
    () => JSON.parse(equippedKey) as ShopCombinationDraft,
    [equippedKey]
  )
  const { avatarRevision } = input
  const { phase } = combinationState
  // Re-checked when the phase returns to "editing", so a save that landed mid-apply is not lost.
  useEffect(() => {
    if (!isEquippedSyncPending(combinationStateRef.current, equipped)) return
    dispatchCombination({
      type: "equipped_changed_elsewhere",
      equipped,
      avatarRevision
    })
  }, [avatarRevision, dispatchCombination, equipped, phase])

  const discardShopPreview = useCallback((): void => {
    dispatchCombination({ type: "discard_draft" })
  }, [dispatchCombination])

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (combinationStateRef.current.phase !== "editing") {
      event.preventDefault()
      return
    }
    discardShopPreview()
  }), [
    discardShopPreview,
    navigation
  ])

  useEffect(() => navigation.addListener("blur", () => {
    publishSelectedShopPreviewWarmup([])
  }), [navigation])

  const shopExitLocked = combinationState.phase !== "editing"
  const handleCloseShop = useCallback((): void => {
    if (combinationStateRef.current.phase !== "editing") return
    discardShopPreview()
    goBackOrFallback(navigation, () => navigation.replace("Lobby"))
  }, [discardShopPreview, navigation])

  return {
    combinationState,
    setCombinationState,
    combinationStateRef,
    dispatchCombination,
    shopExitLocked,
    handleCloseShop
  }
}
