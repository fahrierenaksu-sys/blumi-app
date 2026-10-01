import type { AppLocale } from "../session/appLocale"
import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionState
} from "./roomV2.types"

const COPY = {
  en: {
    states: { idle: "Standing", walking: "Walking", sitting: "Sitting", waving: "Waving", dancing: "Dancing" },
    directions: { front: "front", back: "back", left: "left", right: "right" },
    view: (state: string, direction: string) => `${state}, ${direction} view`,
    sittingOn: (name: string) => `Sitting on ${name}`,
    sitOn: (name: string) => `Sit on ${name}`,
    interactWith: (name: string) => `Interact with ${name}`,
    select: (name: string) => `Select ${name} to move, rotate, or remove`,
    avatar: "Your room avatar",
    avatarHint: "Tap to wave",
    stage: "Walk in room"
  },
  tr: {
    states: { idle: "Ayakta", walking: "Yürüyor", sitting: "Oturuyor", waving: "El sallıyor", dancing: "Dans ediyor" },
    directions: { front: "ön", back: "arka", left: "sol", right: "sağ" },
    view: (state: string, direction: string) => `${state}, ${direction} görünüm`,
    sittingOn: (name: string) => `${name} üzerinde oturuyor`,
    sitOn: (name: string) => `${name} üzerine otur`,
    interactWith: (name: string) => `${name} ile etkileşime geç`,
    select: (name: string) => `${name}: taşımak, döndürmek veya kaldırmak için seç`,
    avatar: "Odadaki avatarın",
    avatarHint: "El sallaması için dokun",
    stage: "Odada yürü"
  }
} as const

export function getRoomV2AvatarAccessibilityValue(input: {
  state?: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
  seatedFurnitureName?: string
}, locale: AppLocale = "en"): string {
  const copy = COPY[locale]
  const state = input.state ?? "idle"
  const direction = copy.directions[input.direction ?? "front"]
  if (state === "sitting" && input.seatedFurnitureName) {
    return copy.view(copy.sittingOn(input.seatedFurnitureName), direction)
  }
  return copy.view(copy.states[state], direction)
}

/**
 * Which room items are buttons. Furniture always is (seat, interact, or
 * select in the editor); the avatar is in an interactive room, where a tap
 * runs the wave → dance → walk chain (ROOM-01), and never in the editor.
 */
export function shouldRoomV2ItemReceiveTap(input: { kind: "avatar" | "furniture"; mode: "edit" | "interact" }): boolean {
  return input.kind === "furniture" || input.mode === "interact"
}

export function getRoomV2ItemAccessibility(input: {
  kind: "avatar" | "furniture"
  name: string | undefined
  interactionType?: string
  mode: "edit" | "interact"
  locale: AppLocale
  tappable?: boolean
}): { label: string; hint: string | undefined } {
  const copy = COPY[input.locale]
  if (input.kind === "avatar") {
    return { label: input.name ?? copy.avatar, hint: input.tappable ? copy.avatarHint : undefined }
  }
  const name = input.name ?? ""
  if (input.mode === "edit") return { label: copy.select(name), hint: undefined }
  return {
    label: input.interactionType === "seat" ? copy.sitOn(name) : copy.interactWith(name),
    hint: undefined
  }
}

export function getRoomV2StageAccessibilityLabel(locale: AppLocale): string {
  return COPY[locale].stage
}
