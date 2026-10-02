import { MOTION_STAGGER } from "../../../ui/motionTokens"

/**
 * Which list rows play the `stagger` entrance: only the rows of the list's
 * first appearance (at most MOTION_STAGGER.maxItems of them, newest first),
 * and each of those only once. Rows that arrive later, or mount again after
 * the list virtualised them away, appear at rest.
 */
export interface FirstAppearanceStagger {
  /** Records the first non-empty list; later calls change nothing. Idempotent. */
  arm(ids: readonly string[]): void
  /** The stagger slot of a row that has not entered yet, or null. A pure read. */
  slotOf(id: string): number | null
  /** The row has entered: it never staggers again. */
  markEntered(id: string): void
}

export function createFirstAppearanceStagger(maxItems: number = MOTION_STAGGER.maxItems): FirstAppearanceStagger {
  let armed = false
  const pending = new Map<string, number>()
  return {
    arm(ids) {
      if (armed || ids.length === 0) return
      armed = true
      ids.slice(0, maxItems).forEach((id, slot) => pending.set(id, slot))
    },
    slotOf: (id) => pending.get(id) ?? null,
    markEntered(id) {
      pending.delete(id)
    }
  }
}
