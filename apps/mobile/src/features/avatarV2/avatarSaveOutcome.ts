import type { CompleteAvatarSelection } from "@blumi/contracts"

export type AvatarSaveOutcome =
  | { kind: "updated"; selection: CompleteAvatarSelection }
  | {
    kind: "conflict"
    current: CompleteAvatarSelection
    message: string
  }
