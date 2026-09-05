import type { UserAvatar } from "../avatarV2/avatarV2.types"
import type { MatchParticipant } from "./matchRoomModel"

export const DEFAULT_MATCH_ROOM_AVATAR: UserAvatar = {
  bodyId: "avatar_v2_body_default",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe",
  noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile",
  hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
  accessoryIds: []
}

export function resolveLatestMatchRoomAvatar(
  avatar: UserAvatar
): UserAvatar {
  return copyUserAvatar(avatar)
}

export function createStableMatchedUserAvatar(
  participant: MatchParticipant
): UserAvatar {
  const hash = hashStableString(participant.userId || participant.displayName)
  const eyesOptions = [
    "avatar_v2_eyes_mocha_doe",
    "avatar_v2_eyes_sage_glass",
    "avatar_v2_eyes_twilight_plum"
  ]
  const noseOptions = [
    "avatar_v2_nose_soft_button",
    "avatar_v2_nose_petal_curve",
    "avatar_v2_nose_gentle_bridge"
  ]
  const mouthOptions = [
    "avatar_v2_mouth_peach_whisper_smile",
    "avatar_v2_mouth_rose_gloss_smile",
    "avatar_v2_mouth_berry_soft_kiss"
  ]
  const hairOptions = [
    "avatar_v2_hair_mocha_ribbon_blowout",
    "avatar_v2_hair_midnight_french_bob",
    "avatar_v2_hair_honey_halfup_waves"
  ]
  const topOptions = [
    "avatar_v2_top_default",
    "avatar_v2_top_cherry_heart_milkmaid_blouse",
    "avatar_v2_top_blush_lace_cardigan"
  ]
  const bottomOptions = [
    "avatar_v2_bottom_default",
    "avatar_v2_bottom_striped_crochet_shorts",
    "avatar_v2_bottom_layered_lace_ruffle_mini_skirt"
  ]
  const shoesOptions = [
    "avatar_v2_shoes_milk_tea_court_sneakers",
    "avatar_v2_shoes_cherry_satin_ballets",
    "avatar_v2_shoes_onyx_heart_mary_janes"
  ]

  return copyUserAvatar({
    ...DEFAULT_MATCH_ROOM_AVATAR,
    eyesId: eyesOptions[Math.floor(hash / 11) % eyesOptions.length],
    noseId: noseOptions[Math.floor(hash / 13) % noseOptions.length],
    mouthId: mouthOptions[Math.floor(hash / 17) % mouthOptions.length],
    hairId: hairOptions[hash % hairOptions.length],
    topId: topOptions[Math.floor(hash / 3) % topOptions.length],
    bottomId: bottomOptions[Math.floor(hash / 5) % bottomOptions.length],
    shoesId: shoesOptions[Math.floor(hash / 7) % shoesOptions.length],
    accessoryIds: []
  })
}

export function copyUserAvatar(avatar: UserAvatar): UserAvatar {
  return {
    ...avatar,
    accessoryIds: [...avatar.accessoryIds]
  }
}

function hashStableString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
