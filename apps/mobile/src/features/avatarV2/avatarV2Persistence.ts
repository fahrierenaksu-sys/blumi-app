import {
  AVATAR_V2_CATALOG,
  DEFAULT_AVATAR_V2
} from "./avatarV2.mock"
import { resolveAvatarV2 } from "./avatarV2Selectors"
import { normalizeAvatarV2ForBody } from "./avatarBodyCompatibility"
import type { UserAvatar } from "./avatarV2.types"

export const AVATAR_V2_STORAGE_KEY = "@blumi/avatar_v2/user_avatar"
export const MALE_AVATAR_BODY_ID = "avatar_v2_body_male_light"

export function getAvatarV2StorageKey(
  userId: string | undefined
): string | null {
  const normalizedUserId = userId?.trim()
  if (!normalizedUserId) return null
  return `${AVATAR_V2_STORAGE_KEY}:${encodeURIComponent(normalizedUserId)}`
}

export function shouldUseLocalAvatarPersistence(
  serverAuthoritative: boolean,
  storageKey: string | null
): storageKey is string {
  return !serverAuthoritative && Boolean(storageKey)
}

export function resolveInitialAvatarV2(
  avatarPresetId: string | undefined
): UserAvatar {
  const bodyId = avatarPresetId === MALE_AVATAR_BODY_ID
    ? MALE_AVATAR_BODY_ID
    : DEFAULT_AVATAR_V2.bodyId
  const resolved = resolveAvatarV2(DEFAULT_AVATAR_V2, AVATAR_V2_CATALOG)
  return normalizeAvatarV2ForBody(resolved, bodyId, AVATAR_V2_CATALOG)
}
