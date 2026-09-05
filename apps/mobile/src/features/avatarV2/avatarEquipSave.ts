export type AvatarEquipSaveResult<TSaved> =
  | { ok: true; saved: TSaved }
  | { ok: false; errorMessage: string }

const NETWORK_SAVE_ERROR =
  "We could not reach Blumi. Check your connection and try again."

function getAvatarEquipSaveErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return DEFAULT_AVATAR_SAVE_ERROR

  const message = error.message.trim()
  if (message.length === 0) return DEFAULT_AVATAR_SAVE_ERROR
  if (/^(network request failed|network error|failed to fetch|the operation was aborted|aborted)$/i.test(message)) {
    return NETWORK_SAVE_ERROR
  }

  return message
}

interface RunAvatarEquipSaveInput<TAvatar, TSaved> {
  nextAvatar: TAvatar
  save: (avatar: TAvatar) => Promise<TSaved>
}

const DEFAULT_AVATAR_SAVE_ERROR = "We could not save that look yet."

/**
 * Returns the failure from this exact save attempt. Consumers do not need to
 * wait for a provider state rerender and therefore cannot read a stale error.
 */
export async function runAvatarEquipSave<TAvatar, TSaved>(
  input: RunAvatarEquipSaveInput<TAvatar, TSaved>
): Promise<AvatarEquipSaveResult<TSaved>> {
  try {
    return {
      ok: true,
      saved: await input.save(input.nextAvatar)
    }
  } catch (error) {
    return {
      ok: false,
      errorMessage: getAvatarEquipSaveErrorMessage(error)
    }
  }
}
