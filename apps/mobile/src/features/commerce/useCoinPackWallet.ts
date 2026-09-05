import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import type { InventoryStoreView } from "../inventory/inventoryStore"
import {
  reconcileCoinPackPurchase,
  runCoinPackPurchase
} from "./coinPackPurchaseCoordinator"
import {
  getRevenueCatCoinPackClient
} from "./revenueCatRuntimeClient"
import type {
  CoinPackId,
  CoinPackStoreProduct
} from "./revenueCatCoinPackClient"
import {
  getCoinPackWalletState,
  type CoinPackWalletPhase
} from "./coinPackWalletModel"

const PENDING_RECONCILE_DELAY_MS = 3_000
const MAX_PENDING_RECONCILE_ATTEMPTS = 3

export function useCoinPackWallet(input: {
  isConnected: boolean
  isProductionSession: boolean
  sessionToken: string
  userId: string
  inventoryStore: InventoryStoreView
}) {
  const client = getRevenueCatCoinPackClient()
  const [products, setProducts] = useState<readonly CoinPackStoreProduct[]>([])
  const [phase, setPhase] = useState<CoinPackWalletPhase>("idle")
  const pendingTransactionIdRef = useRef<string | undefined>(undefined)

  const state = getCoinPackWalletState({
    isConnected: input.isConnected,
    providerAvailable: input.isProductionSession && client.isAvailable,
    phase
  })

  const reconcile = useCallback(async (transactionId: string) =>
    reconcileCoinPackPurchase({
      baseHttpUrl: MOBILE_HTTP_BASE_URL,
      sessionToken: input.sessionToken,
      transactionId
    }), [input.sessionToken])

  useEffect(() => {
    if (!input.isProductionSession || !client.isAvailable) {
      setProducts([])
      return
    }
    let active = true
    void client.syncAuthenticatedUser(input.userId)
      .then(() => client.getCoinPackProducts())
      .then((nextProducts) => {
        if (active) setProducts(nextProducts)
      })
      .catch(() => {
        if (active) setProducts([])
      })
    return () => {
      active = false
    }
  }, [client, input.isProductionSession, input.userId])

  useEffect(() => {
    const transactionId = pendingTransactionIdRef.current
    if (!transactionId || !input.isConnected || !input.isProductionSession) return
    let active = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async (): Promise<void> => {
      if (!active || attempt >= MAX_PENDING_RECONCILE_ATTEMPTS) return
      attempt += 1
      try {
        const result = await reconcile(transactionId)
        if (!active) return
        if (result.status === "credited" || result.status === "already_processed") {
          await input.inventoryStore.hydrateFromServer(input.sessionToken)
          pendingTransactionIdRef.current = undefined
          setPhase("idle")
          return
        }
      } catch {
        if (!active) return
      }
      if (active && attempt < MAX_PENDING_RECONCILE_ATTEMPTS) {
        timer = setTimeout(() => {
          void poll()
        }, PENDING_RECONCILE_DELAY_MS)
      }
    }

    timer = setTimeout(() => {
      void poll()
    }, PENDING_RECONCILE_DELAY_MS)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [
    input.inventoryStore,
    input.isConnected,
    input.isProductionSession,
    input.sessionToken,
    phase,
    reconcile
  ])

  const purchase = useCallback(async (packId: CoinPackId): Promise<void> => {
    if (!state.canPurchase) return
    setPhase("processing")
    try {
      const result = await runCoinPackPurchase({
        client,
        reconcileClient: {
          reconcile: ({ transactionId }) => reconcile(transactionId)
        },
        sessionToken: input.sessionToken,
        userId: input.userId,
        packId,
        isConnected: input.isConnected,
        refreshWallet: async () => {
          const refresh = await input.inventoryStore.hydrateFromServer(input.sessionToken)
          if (!refresh.success) throw new Error("Wallet refresh failed")
        }
      })
      if (result.status === "pending") {
        pendingTransactionIdRef.current = result.transactionId
        setPhase("pending")
        return
      }
      setPhase("idle")
    } catch {
      setPhase("failed")
    }
  }, [client, input.inventoryStore, input.isConnected, input.sessionToken, input.userId, reconcile, state.canPurchase])

  return useMemo(() => ({
    products,
    state,
    purchase
  }), [products, purchase, state])
}
