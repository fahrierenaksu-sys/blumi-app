export type DiscoveryStartupStatus = "pending" | "ready" | "error"

export function resolveDiscoveryStartup(input: {
  safetyReady: boolean
  dataReady: boolean
  hasCard: boolean
  chromeReady: boolean
  imagesReady: boolean
  failed: boolean
}): DiscoveryStartupStatus {
  if (input.failed) return "error"
  if (!input.safetyReady || !input.dataReady || !input.chromeReady) return "pending"
  return !input.hasCard || input.imagesReady ? "ready" : "pending"
}

export function areDiscoveryImagesDisplayed(required: readonly string[], displayed: readonly string[]): boolean {
  const receipts = new Set(displayed)
  return required.every((key) => receipts.has(key))
}

export function recordDiscoveryImageReceipt(current: readonly string[], required: readonly string[], receipt: string): readonly string[] {
  if (!required.includes(receipt)) return current
  if (current.includes(receipt) && current.every((key) => required.includes(key))) return current
  return [...current.filter((key) => required.includes(key) && key !== receipt), receipt]
}
