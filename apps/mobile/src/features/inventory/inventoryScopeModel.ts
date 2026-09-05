import {
  copyInventorySnapshot,
  type BlumiInventorySnapshot
} from "./inventoryModel"

export type InventoryHydrationStatus = "idle" | "loading" | "ready" | "failed"

export interface OwnerInventoryState {
  ownerUserId: string
  localStatus: InventoryHydrationStatus
  serverStatus: InventoryHydrationStatus
  inventory: BlumiInventorySnapshot
}

export function createOwnerInventoryState(
  ownerUserId: string,
  defaults: BlumiInventorySnapshot
): OwnerInventoryState {
  return {
    ownerUserId,
    localStatus: "idle",
    serverStatus: "idle",
    inventory: copyInventorySnapshot(defaults)
  }
}

export function replaceOwnerInventory(input: {
  current: OwnerInventoryState
  ownerUserId: string
  inventory: BlumiInventorySnapshot
  source: "local" | "server"
}): OwnerInventoryState {
  if (input.current.ownerUserId !== input.ownerUserId) return input.current
  if (input.source === "local" && input.current.serverStatus === "ready") {
    return { ...input.current, localStatus: "ready" }
  }
  return {
    ...input.current,
    localStatus: input.source === "local" ? "ready" : input.current.localStatus,
    serverStatus: input.source === "server" ? "ready" : input.current.serverStatus,
    inventory: copyInventorySnapshot(input.inventory)
  }
}

export function shouldApplyServerInventorySnapshot(
  current: BlumiInventorySnapshot,
  candidate: BlumiInventorySnapshot,
  serverReady: boolean
): boolean {
  if (!serverReady) return true
  const currentUpdatedAt = Date.parse(current.updatedAt)
  const candidateUpdatedAt = Date.parse(candidate.updatedAt)
  if (!Number.isFinite(candidateUpdatedAt)) return false
  if (!Number.isFinite(currentUpdatedAt)) return true
  return candidateUpdatedAt > currentUpdatedAt
}

export function shouldApplyInventoryHydrationResponse(input: {
  currentHydrationGeneration: number
  responseHydrationGeneration: number
  currentMutationGeneration: number
  startedMutationGeneration: number
}): boolean {
  return (
    input.currentHydrationGeneration === input.responseHydrationGeneration &&
    input.currentMutationGeneration === input.startedMutationGeneration
  )
}

export function failOwnerInventoryHydration(input: {
  current: OwnerInventoryState
  ownerUserId: string
  source: "local" | "server"
}): OwnerInventoryState {
  if (input.current.ownerUserId !== input.ownerUserId) return input.current
  return {
    ...input.current,
    localStatus: input.source === "local" ? "failed" : input.current.localStatus,
    serverStatus: input.source === "server" ? "failed" : input.current.serverStatus
  }
}

export function isOwnerInventoryReady(
  state: OwnerInventoryState,
  ownerUserId: string,
  requireServer: boolean
): boolean {
  if (state.ownerUserId !== ownerUserId) return false
  return requireServer
    ? state.serverStatus === "ready"
    : state.localStatus === "ready"
}
