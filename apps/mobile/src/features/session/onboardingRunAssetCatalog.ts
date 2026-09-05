import type { ImageSourcePropType } from "react-native"
import type { OnboardingRunAssetMode } from "./onboardingRunAssetGate"
import { APPROVED_ONBOARDING_RUN_ASSETS } from "./onboardingRunApprovedAssetCatalog"

export interface OnboardingRunAssetSet {
  wave: {
    female: readonly ImageSourcePropType[]
    male: readonly ImageSourcePropType[]
  }
  run: {
    chaser: readonly ImageSourcePropType[]
    leader: readonly ImageSourcePropType[]
  }
}

const FALLBACK_ASSETS: OnboardingRunAssetSet = {
  wave: {
    female: [
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_female_f01.png")
    ],
    male: [
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_male_f01.png")
    ]
  },
  run: {
    chaser: [
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_male_f01.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_male_f02.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_male_f03.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_male_f04.png")
    ],
    leader: [
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_female_f01.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_female_f02.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_female_f03.png"),
      require("./assets/onboarding-runners/blumi_intro_canonical_runner_female_f04.png")
    ]
  }
}

const AUTHORED_ASSETS: OnboardingRunAssetSet = {
  wave: {
    female: [
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f01.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f02.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f03.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f04.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f05.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_female_f06.png")
    ],
    male: [
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f01.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f02.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f03.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f04.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f05.png"),
      require("./assets/onboarding-wave-v3-candidate/blumi_intro_wave_male_f06.png")
    ]
  },
  run: {
    chaser: [
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f01.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f02.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f03.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f04.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f05.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_male_f06.png")
    ],
    leader: [
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f01.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f02.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f03.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f04.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f05.png"),
      require("./assets/onboarding-runners-v3-candidate/blumi_intro_run_female_f06.png")
    ]
  }
}

export function getOnboardingRunAssetSet(
  mode: OnboardingRunAssetMode
): OnboardingRunAssetSet {
  if (mode === "walk-fallback") return FALLBACK_ASSETS
  if (mode === "approved-run") return APPROVED_ONBOARDING_RUN_ASSETS
  return AUTHORED_ASSETS
}
