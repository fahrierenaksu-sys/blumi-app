export type WardrobeDoneDecision = "close" | "wait" | "blocked"

/**
 * What "Done" may do. Every equip is saved and confirmed by the server-backed
 * save flow, so the screen closes only once nothing is pending and the last
 * save did not fail.
 */
export function resolveWardrobeDoneDecision(input: {
  isSaving: boolean
  hasPendingTryOn: boolean
  saveErrorMessage: string | null
}): WardrobeDoneDecision {
  if (input.isSaving || input.hasPendingTryOn) return "wait"
  if (input.saveErrorMessage) return "blocked"
  return "close"
}
