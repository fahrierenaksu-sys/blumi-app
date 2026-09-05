import {
  DEFAULT_ROOM_AVATAR_FEMALE,
  DEFAULT_ROOM_AVATAR_MALE,
  ROOM_AVATAR_CATALOG
} from "./room/avatarRoom.mock"
import { resolveRoomAvatarAppearance } from "./room/avatarRoomSelectors"
import type {
  RoomAvatarAppearance,
  RoomAvatarBodyPreset
} from "./room/avatarRoom.types"
import type { AvatarSelection } from "@blumi/contracts"
import {
  cloneAvatarSelection,
  loadoutToUserAvatar,
  normalizeAvatarSelection,
  normalizeCompleteAvatarSelection
} from "./avatarSelectionModel"
import { projectAvatarV2ToRoomAvatarAppearance } from "./room/avatarRoomProjection"

export const MALE_AVATAR_PRESET_ID = "avatar_v2_body_male_light"

export type CandidateAvatarSnapshotSource =
  | "remote_candidate_avatar"
  | "preview_fallback"

export interface CandidateAvatarSnapshot {
  kind: "candidate_avatar_snapshot"
  userId: string
  displayName: string
  source: CandidateAvatarSnapshotSource
  previewSeed: string
  label: string
  bodyPreset: RoomAvatarBodyPreset
  avatarSelection?: AvatarSelection
}

export function createCandidateAvatarSnapshot(input: {
  userId: string
  displayName: string
  avatarPresetId?: string
  avatarSelection?: AvatarSelection
  avatarSnapshot?: CandidateAvatarSnapshot | null
}): CandidateAvatarSnapshot {
  if (
    input.avatarSnapshot &&
    input.avatarSnapshot.kind === "candidate_avatar_snapshot" &&
    input.avatarSnapshot.userId === input.userId
  ) {
    return input.avatarSnapshot
  }

  return {
    kind: "candidate_avatar_snapshot",
    userId: input.userId,
    displayName: input.displayName,
    source: input.avatarSelection || input.avatarPresetId
      ? "remote_candidate_avatar"
      : "preview_fallback",
    previewSeed: input.userId,
    label: "Blumi avatar",
    bodyPreset: bodyPresetFromAvatarPresetId(
      input.avatarSelection?.presetId ?? input.avatarPresetId
    ),
    ...(input.avatarSelection
      ? { avatarSelection: cloneAvatarSelection(input.avatarSelection) }
      : {})
  }
}

export function readCandidateAvatarSnapshot(
  value: unknown,
  fallback: {
    userId: string
    displayName: string
    avatarPresetId?: string
    avatarSelection?: AvatarSelection
  }
): CandidateAvatarSnapshot {
  const candidate = value as { avatarSnapshot?: unknown } | null | undefined
  const avatarSnapshot =
    candidate && typeof candidate === "object"
      ? candidate.avatarSnapshot
      : undefined

  return createCandidateAvatarSnapshot({
    ...fallback,
    avatarSnapshot: isCandidateAvatarSnapshot(avatarSnapshot)
      ? avatarSnapshot
      : null
  })
}

export function createCandidateAvatarAppearance(
  snapshot: CandidateAvatarSnapshot
): RoomAvatarAppearance {
  const complete = normalizeCompleteAvatarSelection(snapshot.avatarSelection)
  if (complete) {
    return projectAvatarV2ToRoomAvatarAppearance({
      avatar: loadoutToUserAvatar(complete.loadout)
    }).appearance
  }
  if (snapshot.bodyPreset === "male") {
    return resolveRoomAvatarAppearance(
      DEFAULT_ROOM_AVATAR_MALE,
      ROOM_AVATAR_CATALOG
    )
  }

  const hash = hashCandidateSeed(snapshot.previewSeed)
  const variant = hash % 4
  const appearancePatch: Partial<RoomAvatarAppearance> =
    variant === 0
      ? {
          bodyPreset: "female",
          topId: "room_avatar_top_female_blush_lace_cardigan_v2",
          bottomId: "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
          shoesId: "room_avatar_shoes_female_cherry_satin_ballets_v2"
        }
      : variant === 1
        ? {
            bodyPreset: "female",
            topId: "room_avatar_top_female_noir_rose_heart_cardigan_v2",
            bottomId: "room_avatar_bottom_female_black_palm_embellished_pants_v2",
            shoesId: "room_avatar_shoes_female_milk_tea_court_sneakers_v2"
          }
        : variant === 2
          ? {
              bodyPreset: "female",
              topId: "room_avatar_top_female_powder_blue_ribbon_corset_top_v2",
              bottomId: "room_avatar_bottom_female_striped_crochet_shorts_v2",
              shoesId: "room_avatar_shoes_female_onyx_heart_mary_janes_v2"
            }
          : {
              bodyPreset: "female",
              topId: "room_avatar_top_female_sage_ribbon_knit_jacket_v2",
              bottomId: "room_avatar_bottom_female_smoky_floral_mesh_pants_v2",
              shoesId: "room_avatar_shoes_female_pearl_slingback_sandals_v2"
            }

  return resolveRoomAvatarAppearance(
    {
      ...DEFAULT_ROOM_AVATAR_FEMALE,
      ...appearancePatch
    },
    ROOM_AVATAR_CATALOG
  )
}

export function bodyPresetFromAvatarPresetId(
  avatarPresetId: string | undefined
): RoomAvatarBodyPreset {
  return avatarPresetId === MALE_AVATAR_PRESET_ID ? "male" : "female"
}

function isCandidateAvatarSnapshot(
  value: unknown
): value is CandidateAvatarSnapshot {
  if (!value || typeof value !== "object") return false
  const snapshot = value as CandidateAvatarSnapshot
  const avatarSelection = snapshot.avatarSelection === undefined
    ? undefined
    : normalizeAvatarSelection(snapshot.avatarSelection)
  return (
    snapshot.kind === "candidate_avatar_snapshot" &&
    typeof snapshot.userId === "string" &&
    typeof snapshot.displayName === "string" &&
    typeof snapshot.previewSeed === "string" &&
    typeof snapshot.label === "string" &&
    (snapshot.bodyPreset === "female" || snapshot.bodyPreset === "male") &&
    (snapshot.source === "remote_candidate_avatar" ||
      snapshot.source === "preview_fallback")
    && (snapshot.avatarSelection === undefined || Boolean(avatarSelection))
  )
}

function hashCandidateSeed(seed: string): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}
