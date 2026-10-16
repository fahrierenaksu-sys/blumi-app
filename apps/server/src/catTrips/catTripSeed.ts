import { createHmac } from "node:crypto"

/**
 * A counter-based random stream keyed by HMAC-SHA256. The same
 * (secret, user, day) always yields the same numbers, so every draw can be
 * replayed by someone who holds the secret, and nobody else can predict it.
 */
export interface CatTripSeed {
  /** First 16 hex characters of the digest; safe to store. */
  readonly digest: string
  /** A float in [0, 1) for a named draw; the same label gives the same number. */
  unit(label: string): number
  /** An integer in [0, maxExclusive). */
  int(label: string, maxExclusive: number): number
}

export function createCatTripSeed(secret: string, userId: string, dayKey: string): CatTripSeed {
  const root = createHmac("sha256", secret).update(`cat-trips:v1:${userId}:${dayKey}`).digest()
  const unit = (label: string) => {
    const bytes = createHmac("sha256", root).update(label).digest()
    // 48 random bits: exact in a double, no modulo bias.
    return (bytes.readUIntBE(0, 6)) / 2 ** 48
  }
  const seed: CatTripSeed = {
    digest: root.toString("hex").slice(0, 16),
    unit,
    int(label, maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new RangeError("maxExclusive must be a positive integer")
      return Math.min(maxExclusive - 1, Math.floor(unit(label) * maxExclusive))
    }
  }
  return Object.freeze(seed)
}
