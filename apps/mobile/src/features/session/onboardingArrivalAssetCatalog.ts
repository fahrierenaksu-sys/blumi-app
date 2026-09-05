import type { ImageSourcePropType } from "react-native"

export const ONBOARDING_ARRIVAL_ATLAS_GRID = Object.freeze({
  columns: 6,
  rows: 5,
  frameWidth: 256,
  frameHeight: 384
})

export const ONBOARDING_ARRIVAL_ATLAS_ASSETS = {
  female: require("./assets/onboarding-arrival-v3-candidate/blumi_intro_arrival_female_atlas.png") as ImageSourcePropType,
  male: require("./assets/onboarding-arrival-v3-candidate/blumi_intro_arrival_male_atlas.png") as ImageSourcePropType
} as const
