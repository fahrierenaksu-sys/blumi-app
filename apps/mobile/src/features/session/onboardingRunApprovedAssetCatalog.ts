import type { ImageSourcePropType } from "react-native"
import type { OnboardingRunAssetSet } from "./onboardingRunAssetCatalog"

export const APPROVED_ONBOARDING_RUN_ASSETS: OnboardingRunAssetSet = {
  wave: {
    female: [
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f01.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f02.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f03.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f04.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f05.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f06.png")
    ] as readonly ImageSourcePropType[],
    male: [
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f01.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f02.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f03.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f04.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f05.png"),
      require("./assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f06.png")
    ] as readonly ImageSourcePropType[]
  },
  run: {
    chaser: [
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f01.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f01.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f02.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f02.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f03.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f03.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f04.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f04.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f05.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f05.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f06.png"),
      require("./assets/onboarding-runners-v11-remodeled-runtime/blumi_intro_run_male_f06.png")
    ] as readonly ImageSourcePropType[],
    leader: [
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f01.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f01.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f02.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f02.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f03.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f03.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f04.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f04.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f05.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f05.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f06.png"),
      require("./assets/onboarding-runners-v3-runtime/blumi_intro_run_female_f06.png")
    ] as readonly ImageSourcePropType[]
  }
}
