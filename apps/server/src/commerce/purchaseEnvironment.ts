export type PurchaseEnvironment = "production" | "sandbox"

/** RevenueCat webhooks use uppercase; REST v2 uses lowercase. Unknown is never trusted. */
export function matchesPurchaseEnvironment(value: unknown, expected: PurchaseEnvironment = "production"): boolean {
  return typeof value === "string" &&
    (value === "PRODUCTION" || value === "production" || value === "SANDBOX" || value === "sandbox") &&
    value.toLowerCase() === expected
}
