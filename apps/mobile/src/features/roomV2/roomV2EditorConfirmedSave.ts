import type { UserRoomDecor } from "./roomV2.types"

export type ConfirmedRoomV2SaveResult =
  | { status: "saved"; decor: UserRoomDecor }
  | { status: "conflict" }
  | { status: "failed" }

export type RoomV2EditorConfirmedSaveResult =
  | { status: "saved"; decor: UserRoomDecor }
  | { status: "blocked"; feedback: string }

export async function saveRoomV2EditorDraftConfirmed(
  decor: UserRoomDecor,
  saveConfirmed: (
    decor: UserRoomDecor
  ) => Promise<ConfirmedRoomV2SaveResult>
): Promise<RoomV2EditorConfirmedSaveResult> {
  try {
    const result = await saveConfirmed(decor)
    if (result.status === "saved") return result
    if (result.status === "conflict") {
      return {
        status: "blocked",
        feedback: "A newer room was found. Reset or review your room, then save again."
      }
    }
  } catch {
    // Provider owns technical diagnostics; the editor only receives safe copy.
  }

  return {
    status: "blocked",
    feedback: "Your room could not be confirmed by Blumi. Try again."
  }
}
