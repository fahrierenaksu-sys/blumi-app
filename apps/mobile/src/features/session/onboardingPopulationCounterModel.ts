export const ONBOARDING_POPULATION_COUNTER_TIMING_MS = Object.freeze({
  finalHold: 180
})

export const ONBOARDING_POPULATION_COUNTER_LAYOUT = Object.freeze({
  digitWidth: 29,
  compactDigitWidth: 25
})

export interface OnboardingPopulationOdometerColumn {
  finalDigit: number
  steps: number
  digits: readonly number[]
  cells: readonly OnboardingPopulationOdometerCell[]
}

export interface OnboardingPopulationOdometerCell {
  digit: number
  offset: number
}

const WHEEL_TURNS_BY_COLUMN = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5] as const

export function getOnboardingPopulationOdometerColumns(
  finalValue: string
): readonly OnboardingPopulationOdometerColumn[] {
  const finalDigits = finalValue
    .replace(/\D/g, "")
    .split("")
    .map(Number)

  return finalDigits.map((finalDigit, index) => {
    const turns = WHEEL_TURNS_BY_COLUMN[index] ?? WHEEL_TURNS_BY_COLUMN.at(-1)!
    const steps = turns * 10 + finalDigit
    const cells = Array.from({ length: steps + 1 }, (_, offset) => ({
      digit: offset % 10,
      offset
    }))
    return {
      finalDigit,
      steps,
      digits: cells.map(({ digit }) => digit),
      cells
    }
  })
}
