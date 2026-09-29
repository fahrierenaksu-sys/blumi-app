import { useCallback, useEffect, useMemo, useRef } from "react"
import { ECONOMY_CATALOG, resolveR1PublishedEconomyCatalog } from "@blumi/domain"
import { Image as ExpoImage } from "expo-image"
import { Image as ReactNativeImage, type ImageSourcePropType } from "react-native"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2Catalog"
import { getAvatarV2ShopItemsCompatibleWithBody } from "../avatarV2/avatarBodyCompatibility"
import { getIdleAvatarLayerAssets } from "../avatarV2/room/avatarIdleAssets"
import { useAvatarV2 } from "../avatarV2/state/AvatarV2Provider"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../roomV2/roomV2Catalog"
import { resolveRoomV2Shell } from "../roomV2/roomV2Selectors"
import { useRoomV2 } from "../roomV2/state/RoomV2Provider"
import { getAppLocale, getLocaleIdentifier } from "../session/appLocale"
import {
  getRoomProductThumbnailSource,
  getShopProductThumbnailSource,
  PRODUCT_REFERENCE_AVATAR_ITEM_IDS
} from "../shop/shopAssets"
import { resolveShopCatalogRuntime } from "../shop/shopCatalogRuntime"
import { getShopLayoutMetrics } from "../shop/shopLayoutMetrics"
import { useAppViewportMetrics } from "../../ui/layout/useAppViewportMetrics"
import {
  admitWarmupUri,
  createWarmupSessionBudget,
  createPrioritySequentialPrefetchLane,
  prefetchCurrentSceneUris,
  selectBoundedWarmupUris,
  selectInitialShopRoomItemIds,
  selectInitialShopTopIds,
  settleWarmupUri,
  subscribeToSelectedShopPreviewWarmup,
  type WarmupPriority,
  type WarmupSessionBudget
} from "./sceneAssetWarmupModel"

const shopBackgroundSource = require("../../../assets/ui/home-liquid-background-v2.png") as ImageSourcePropType
// Nominal decoded RGBA request estimates, not compressed file size or native cache residency.
const SHOP_BUDGET = { maxAssets: 5, maxDecodedBytes: 9 * 1024 * 1024 }
const SELECTED_PREVIEW_BUDGET = { maxAssets: 4, maxDecodedBytes: 8 * 1024 * 1024 }
const CURRENT_SCENE_BUDGET = { maxAssets: 15, maxDecodedBytes: 24 * 1024 * 1024 }
const SESSION_BUDGET = { maxAssets: 32, maxDecodedBytes: 48 * 1024 * 1024 }

export function scheduleSceneAssetWarmup(
  runWarmup: () => void,
  enabled: boolean,
  delayMs = 1_000
): () => void {
  if (!enabled) return () => {}

  let idleId: number | undefined
  let cancelled = false
  const timeoutId = setTimeout(() => {
    if (cancelled) return
    if (typeof globalThis.requestIdleCallback === "function") {
      idleId = globalThis.requestIdleCallback(() => {
        if (!cancelled) runWarmup()
      })
      return
    }
    runWarmup()
  }, delayMs)

  return () => {
    cancelled = true
    clearTimeout(timeoutId)
    if (idleId !== undefined) globalThis.cancelIdleCallback?.(idleId)
  }
}

function warmSources(
  sources: readonly ImageSourcePropType[],
  budget: { maxAssets: number; maxDecodedBytes: number },
  isCurrent: () => boolean,
  completed: Set<string>,
  inFlight: Map<string, Promise<boolean>>,
  sourceDimensions: Map<string, { width?: number; height?: number }>,
  prefetch: (
    uri: string,
    isCurrent: () => boolean,
    priority: WarmupPriority
  ) => Promise<boolean>,
  options: {
    priority?: WarmupPriority
  } = {}
): Promise<void> {
  const priority = options.priority ?? "background"
  const resolvedSources = sources.map((source) => ReactNativeImage.resolveAssetSource(source) ?? {})
  const uris = selectBoundedWarmupUris(resolvedSources, budget)
  const sourceByUri = new Map(resolvedSources.flatMap((source) =>
    source.uri ? [[source.uri, source] as const] : []
  ))
  return prefetchCurrentSceneUris(
    uris,
    (uri, requestPriority) => {
      const source = sourceByUri.get(uri)
      if (source) sourceDimensions.set(uri, { width: source.width, height: source.height })
      return prefetch(uri, isCurrent, requestPriority ?? priority)
    },
    isCurrent,
    completed,
    inFlight,
    priority
  )
}

/** Prefetch bounded current-scene and first Shop viewport assets off the render path.
 * Never hold navigation or the avatar renderer while this best-effort task runs.
 */
export function CurrentSceneAssetWarmup({
  enabled,
  initialShopMode,
  sessionMode,
  isFullShopCatalogQaPreview
}: {
  enabled: boolean
  initialShopMode?: "avatar" | "home"
  sessionMode: "demo" | "production"
  isFullShopCatalogQaPreview: boolean
}) {
  const { avatar } = useAvatarV2()
  const { userRoomDecor } = useRoomV2()
  const roomShellId = userRoomDecor.roomShellId
  const viewportMetrics = useAppViewportMetrics({ bottomNavVisible: true })
  const shopLayoutMetrics = useMemo(() => getShopLayoutMetrics({
    width: viewportMetrics.safeWidth,
    height: viewportMetrics.contentHeight,
    fontScale: viewportMetrics.fontScale,
    horizontalInset: viewportMetrics.horizontalGutter,
    minimumTouchTarget: viewportMetrics.minTouchTarget
  }), [
    viewportMetrics.contentHeight,
    viewportMetrics.fontScale,
    viewportMetrics.horizontalGutter,
    viewportMetrics.minTouchTarget,
    viewportMetrics.safeWidth
  ])
  const shopMode = initialShopMode ?? "avatar"
  const homeVisibleProductLimit = shopLayoutMetrics.catalog.accessibilityLayout ? 2 : 4
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const completedRef = useRef<Set<string> | null>(null)
  if (completedRef.current === null) completedRef.current = new Set<string>()
  const completed = completedRef.current
  const inFlightRef = useRef<Map<string, Promise<boolean>> | null>(null)
  if (inFlightRef.current === null) inFlightRef.current = new Map<string, Promise<boolean>>()
  const inFlight = inFlightRef.current
  const sessionBudgetRef = useRef<WarmupSessionBudget | null>(null)
  const sessionBudget = sessionBudgetRef.current ?? (sessionBudgetRef.current = createWarmupSessionBudget(
    SESSION_BUDGET.maxAssets,
    SESSION_BUDGET.maxDecodedBytes
  ))
  const sourceDimensionsRef = useRef<Map<string, { width?: number; height?: number }> | null>(null)
  if (sourceDimensionsRef.current === null) {
    sourceDimensionsRef.current = new Map<string, { width?: number; height?: number }>()
  }
  const sourceDimensions = sourceDimensionsRef.current
  const selectedGenerationRef = useRef(0)
  const prefetchLaneRef = useRef<ReturnType<typeof createPrioritySequentialPrefetchLane> | null>(null)
  const prefetchLane = prefetchLaneRef.current ?? (prefetchLaneRef.current = createPrioritySequentialPrefetchLane(
    (uri, isCurrent) => isCurrent()
      ? ExpoImage.prefetch(uri, "memory-disk")
      : Promise.resolve(false),
    {
      logicalDeadlineMs: 5_000,
      uriCooldownMs: 30_000,
      onNativeStart: (uri) => admitWarmupUri(uri, sourceDimensions.get(uri), sessionBudget),
      onNativeSettled: (uri, accepted) => {
        settleWarmupUri(uri, accepted, sessionBudget)
        // This is a shared native-cache receipt, not route or selection state.
        // A late successful decode can prevent redundant work on the next visit.
        if (accepted) completed.add(uri)
        sourceDimensions.delete(uri)
      },
      onNativeNotStarted: (uri) => sourceDimensions.delete(uri)
    }
  ))
  const cancelCommonRef = useRef<(() => void) | null>(null)

  const startCommonWarmup = useCallback(() => {
    if (!enabledRef.current || cancelCommonRef.current) return
    let current = true
    // One active shell is needed for the first MyRoom frame. Give it the next
    // idle slot, without pulling the larger avatar batch onto navigation.
    const cancelShellWarmup = scheduleSceneAssetWarmup(() => {
      if (!current) return
      const roomShellSource = resolveRoomV2Shell(
        ROOM_V2_SHELL_CATALOG,
        roomShellId,
        DEFAULT_ROOM_V2_SHELL_ID
      )?.asset.source
      if (roomShellSource === undefined) return
      void warmSources([roomShellSource], CURRENT_SCENE_BUDGET, () => current, completed, inFlight, sourceDimensions, prefetchLane)
    }, true, 0)
    const cancelScheduled = scheduleSceneAssetWarmup(() => {
      if (!current) return
      const sources = getIdleAvatarLayerAssets(avatar).map((asset) => asset.source)
      void warmSources(sources, CURRENT_SCENE_BUDGET, () => current, completed, inFlight, sourceDimensions, prefetchLane)
    }, true)
    cancelCommonRef.current = () => {
      current = false
      cancelShellWarmup()
      cancelScheduled()
    }
  }, [avatar, completed, inFlight, prefetchLane, roomShellId, sourceDimensions])

  useEffect(() => {
    if (!enabled) return
    const unsubscribe = subscribeToSelectedShopPreviewWarmup((request) => {
      selectedGenerationRef.current = request.generation
      if (request.sources.length === 0) return
      void warmSources(
        request.sources,
        SELECTED_PREVIEW_BUDGET,
        () => enabledRef.current && selectedGenerationRef.current === request.generation,
        completed,
        inFlight,
        sourceDimensions,
        prefetchLane,
        {
          priority: "selected"
        }
      )
    })
    return () => {
      selectedGenerationRef.current += 1
      unsubscribe()
    }
  }, [completed, enabled, inFlight, prefetchLane, sourceDimensions])

  useEffect(() => {
    if (enabled) {
      startCommonWarmup()
    } else {
      cancelCommonRef.current?.()
      cancelCommonRef.current = null
    }
  }, [enabled, startCommonWarmup])

  useEffect(() => {
    return () => {
      cancelCommonRef.current?.()
      cancelCommonRef.current = null
    }
  }, [startCommonWarmup])

  useEffect(() => {
    if (!enabled) return
    let current = true
    // Lobby and Shop retain this one lifecycle. Chat/MyRoom/restricted routes
    // cancel queued work; completed URI receipts survive repeat Shop visits.
    const cancelScheduled = scheduleSceneAssetWarmup(() => {
      if (!current || !enabledRef.current) return
      const sources: ImageSourcePropType[] = [shopBackgroundSource]
      if (shopMode === "home") {
        const shopCatalogRuntime = resolveShopCatalogRuntime({
          sessionMode,
          isRoomCatalogQaPreview: false,
          isFullShopCatalogQaPreview
        })
        const publishedCatalog = shopCatalogRuntime.enforcePublishedCatalog
          ? resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG)
          : undefined
        const publishedIds = publishedCatalog
          ? new Set(publishedCatalog.map((item) => item.itemId))
          : undefined
        const roomItems = ROOM_V2_FURNITURE_CATALOG.filter(
          (item) => !publishedIds || publishedIds.has(item.id)
        )
        const firstRoomIds = selectInitialShopRoomItemIds(
          roomItems.map((item) => ({
            sourceItemId: item.id,
            title: item.name,
            category: item.category
          })),
          homeVisibleProductLimit
        )
        const roomItemsById = new Map(roomItems.map((item) => [item.id, item]))
        sources.push(...firstRoomIds
          .map((id) => getRoomProductThumbnailSource(id) ?? roomItemsById.get(id)?.asset.source)
          .filter((source): source is ImageSourcePropType => source !== undefined))
      } else {
        const publishedCatalog = resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG)
        const publishedIds = new Set(publishedCatalog.map((item) => item.itemId))
        const pricedIds = new Set(publishedCatalog.filter((item) => item.priceCoins !== null).map((item) => item.itemId))
        const topIds = selectInitialShopTopIds(
          getAvatarV2ShopItemsCompatibleWithBody(AVATAR_V2_CATALOG, avatar.bodyId),
          publishedIds,
          PRODUCT_REFERENCE_AVATAR_ITEM_IDS,
          pricedIds,
          (id) => getShopProductThumbnailSource(id) !== undefined,
          getLocaleIdentifier(getAppLocale())
        )
        sources.push(...topIds
          .map((id) => getShopProductThumbnailSource(id))
          .filter((source): source is ImageSourcePropType => source !== undefined))
      }
      void warmSources(sources, SHOP_BUDGET, () => current && enabledRef.current, completed, inFlight, sourceDimensions, prefetchLane)
    }, true, 0)
    return () => {
      current = false
      cancelScheduled()
    }
  }, [avatar, completed, enabled, homeVisibleProductLimit, inFlight, isFullShopCatalogQaPreview, prefetchLane, sessionMode, shopMode, sourceDimensions])

  return null
}
