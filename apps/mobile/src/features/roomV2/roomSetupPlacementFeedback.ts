import type { RoomSetupCopy } from "./roomSetupCopy"
import type { RoomV2PersistenceState } from "./roomV2EditGate"

export type RoomSetupMutationAction = "placed" | "rotated"

export interface RoomSetupMutationFeedback {
  /** Empty when the room accepted the change. */
  readonly errorMessage: string
  /** Success copy; undefined when the change was rejected. */
  readonly message?: string
  readonly selectBed: boolean
}

/**
 * Feedback after the room setup asks the room to place or rotate the bed.
 * A rejected mutation never shows success copy or selects the bed.
 */
export function resolveRoomSetupMutationFeedback(input: {
  readonly accepted: boolean
  readonly action: RoomSetupMutationAction
  readonly copy: Pick<RoomSetupCopy, "placement" | "feedback">
}): RoomSetupMutationFeedback {
  if (!input.accepted) {
    return { errorMessage: input.copy.feedback.mutationRejected, selectBed: false }
  }
  return input.action === "placed"
    ? { errorMessage: "", message: input.copy.placement.placed, selectBed: true }
    : { errorMessage: "", message: input.copy.placement.rotated, selectBed: false }
}

export type RoomSetupStatusLine =
  | { readonly tone: "alert"; readonly text: string }
  | { readonly tone: "polite"; readonly text: string }
  | null

/**
 * The single status line under the room. A failed save always wins over any
 * earlier success copy, and a rejected change wins over progress hints.
 */
export function resolveRoomSetupStatusLine(input: {
  readonly persistenceState: RoomV2PersistenceState
  readonly errorMessage: string
  readonly message: string
  readonly showMessage: boolean
  readonly copy: Pick<RoomSetupCopy, "feedback">
}): RoomSetupStatusLine {
  if (input.persistenceState === "failed") {
    return { tone: "alert", text: input.copy.feedback.persistenceAttention }
  }
  if (input.errorMessage) {
    return { tone: "alert", text: input.errorMessage }
  }
  if (input.showMessage && input.message) {
    return { tone: "polite", text: input.message }
  }
  return null
}
