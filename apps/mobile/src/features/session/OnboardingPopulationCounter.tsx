import { Fragment, type ReactNode } from "react"
import { Text, View } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
import { getOnboardingPopulationOdometerColumns } from "./onboardingPopulationCounterModel"
import { onboardingWorldSceneStyles as styles } from "./onboardingWorldSceneStyles"

interface OnboardingPopulationCounterProps {
  compact: boolean
  progress: SharedValue<number>
  value: string
}

const SEPARATOR_AFTER_COLUMN = new Set([0, 3, 6])

export function OnboardingPopulationCounter({
  compact,
  progress,
  value
}: OnboardingPopulationCounterProps) {
  const columns = getOnboardingPopulationOdometerColumns(value)
  const lineHeight = compact ? 40 : 46
  const separator = value.includes(".") ? "." : ","
  const valueStyle = [
    styles.populationValue,
    compact ? styles.populationValueCompact : null
  ]

  return (
    <View
      pointerEvents="none"
      style={[
        styles.populationValueViewport,
        compact ? styles.populationValueViewportCompact : null
      ]}
      testID="onboarding-population-counter"
    >
      <View style={styles.populationOdometerRow}>
        {columns.map((column, index) => (
          <Fragment key={`population-wheel-${index}`}>
            <View style={[
              styles.populationDigitColumn,
              compact ? styles.populationDigitColumnCompact : null
            ]}>
              <DigitStrip
                distance={column.steps * lineHeight}
                height={(column.steps + 1) * lineHeight}
                progress={progress}
              >
                {column.cells.map((cell) => (
                  <View
                    key={`population-wheel-${index}-cell-${cell.offset}`}
                    style={[
                      styles.populationDigitCellFrame,
                      { height: lineHeight }
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={1.1}
                      style={[valueStyle, styles.populationDigitCell]}
                    >
                      {cell.digit}
                    </Text>
                  </View>
                ))}
              </DigitStrip>
            </View>
            {SEPARATOR_AFTER_COLUMN.has(index) ? (
              <Text
                maxFontSizeMultiplier={1.1}
                style={[
                  valueStyle,
                  styles.populationSeparator,
                  compact ? styles.populationSeparatorCompact : null
                ]}
              >
                {separator}
              </Text>
            ) : null}
          </Fragment>
        ))}
        <Text
          maxFontSizeMultiplier={1.1}
          style={[valueStyle, styles.populationPlus]}
        >
          +
        </Text>
      </View>
    </View>
  )
}

/** One odometer wheel: rolls its full distance on the shared reveal clock. */
function DigitStrip({
  children,
  distance,
  height,
  progress
}: {
  children: ReactNode
  distance: number
  height: number
  progress: SharedValue<number>
}) {
  const rollStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(progress.value, [0, 1], [0, -distance], Extrapolation.CLAMP)
    }]
  }))
  return (
    <Animated.View style={[styles.populationDigitStrip, { height }, rollStyle]}>
      {children}
    </Animated.View>
  )
}
