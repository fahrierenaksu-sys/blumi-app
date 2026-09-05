import type {
  CoinPackId,
  RevenueCatCoinPackClient
} from "./revenueCatCoinPackClient"

export type CoinPackReconcileStatus = "credited" | "already_processed" | "pending"
export type CoinPackPurchaseStatus =
  | CoinPackReconcileStatus
  | "cancelled"
  | "offline"

export class CoinPackReconcileError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message)
    this.name = "CoinPackReconcileError"
  }
}

export interface CoinPackReconcileClient {
  reconcile: (
    input: { sessionToken: string; transactionId: string }
  ) => Promise<{ status: CoinPackReconcileStatus }>
}

export interface ReconcileCoinPackPurchaseInput {
  baseHttpUrl: string
  sessionToken: string
  transactionId: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export async function reconcileCoinPackPurchase(
  input: ReconcileCoinPackPurchaseInput
): Promise<{ status: CoinPackReconcileStatus }> {
  const response = await (input.fetcher ?? fetch)(
    withBaseUrl(input.baseHttpUrl, "/v1/commerce/coin-packs/reconcile"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.sessionToken}`,
        "content-type": "application/json"
      },
      // The provider transaction is verified server-side. No user id, coin
      // quantity, receipt payload, or local wallet balance is trusted here.
      body: JSON.stringify({ transactionIds: [input.transactionId] }),
      signal: input.signal
    }
  )
  const payload: unknown = await readJson(response)
  if (!response.ok) {
    throw new CoinPackReconcileError(
      getApiErrorMessage(payload, "We could not verify that purchase yet."),
      response.status
    )
  }
  const status = readReconcileStatus(payload, input.transactionId)
  if (!status) {
    throw new Error("Blumi could not read the purchase verification result.")
  }
  return { status }
}

export async function runCoinPackPurchase(input: {
  client: RevenueCatCoinPackClient
  reconcileClient: CoinPackReconcileClient
  sessionToken: string
  userId: string
  packId: CoinPackId
  isConnected: boolean
  refreshWallet: () => Promise<unknown>
}): Promise<{ status: CoinPackPurchaseStatus; transactionId?: string }> {
  if (!input.isConnected) return { status: "offline" }

  await input.client.syncAuthenticatedUser(input.userId)
  const nativeResult = await input.client.purchaseCoinPack(input.packId)
  if (nativeResult.status === "cancelled") return nativeResult
  if (nativeResult.status === "pending") return nativeResult

  let reconciliation: { status: CoinPackReconcileStatus }
  try {
    reconciliation = await input.reconcileClient.reconcile({
      sessionToken: input.sessionToken,
      transactionId: nativeResult.transaction.transactionId
    })
  } catch (error) {
    if (isNonRetryableReconcileError(error)) throw error
    return {
      status: "pending",
      transactionId: nativeResult.transaction.transactionId
    }
  }
  if (reconciliation.status === "credited" || reconciliation.status === "already_processed") {
    // The server ledger is the only coin authority. Refresh, do not mutate coins.
    await input.refreshWallet()
  }
  return reconciliation.status === "pending"
    ? { ...reconciliation, transactionId: nativeResult.transaction.transactionId }
    : reconciliation
}

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const base = baseHttpUrl.trim().replace(/\/+$/, "")
  if (!base) throw new Error("A commerce API URL is required.")
  return `${base}${path}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readReconcileStatus(
  value: unknown,
  transactionId: string
): CoinPackReconcileStatus | undefined {
  if (!value || typeof value !== "object") return undefined
  const results = (value as Record<string, unknown>).results
  if (!Array.isArray(results)) return undefined
  const matchingResult = results.find((result) =>
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>).transactionId === transactionId
  )
  const status = matchingResult && typeof matchingResult === "object"
    ? (matchingResult as Record<string, unknown>).status
    : undefined
  return status === "credited" || status === "already_processed" || status === "pending"
    ? status
    : undefined
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? String((payload as Record<string, unknown>).error)
    : fallback
}

function isNonRetryableReconcileError(error: unknown): boolean {
  return (
    error instanceof CoinPackReconcileError &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  )
}
