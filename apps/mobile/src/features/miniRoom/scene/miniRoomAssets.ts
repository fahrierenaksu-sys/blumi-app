import type { ImageSourcePropType } from "react-native"

const image = (asset: ImageSourcePropType): ImageSourcePropType => asset

export const miniRoomAssets = {
  rooms: {
    cozyPinkBedroom: image(require("../assets/runtime/rooms/cozy_pink_bedroom/room_bg.webp"))
  },
  props: {
    pinkBed: image(require("../assets/runtime/props/prop_pink_bed.webp")),
    pinkSofa: image(require("../assets/runtime/props/prop_pink_sofa.webp")),
    pinkChairRound: image(require("../assets/runtime/props/prop_pink_chair_round.webp")),
    pinkChairThree: image(require("../assets/runtime/props/prop_pink_chair_3.webp")),
    miniTable: image(require("../assets/runtime/props/prop_mini_table.webp")),
    notebookTable: image(require("../assets/runtime/props/prop_notebook_table.webp")),
    heartLamp: image(require("../assets/runtime/props/prop_heart_lamp.webp")),
    hangingPlant: image(require("../assets/runtime/props/prop_hanging_plant.webp"))
  },
  ui: {
    speechEmoteSheet: image(require("../assets/runtime/ui/speech_emote_sheet.webp")),
    generatedAvatarSheetReference: image(require("../assets/runtime/ui/generated_avatar_sheet_reference.webp"))
  }
} as const
