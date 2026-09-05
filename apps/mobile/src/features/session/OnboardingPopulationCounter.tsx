import { Fragment } from "react"
import { Animated, Text, View } from "react-native"
import { getOnboardingPopulationOdometerColumns } from "./onboardingPopulationCounterModel"
import { onboardingWorldSceneStyles as styles } from "./onboardingWorldSceneStyles"

interface OnboardingPopulationCounterProps {
  compact: boolean
  progress: Animated.Value
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
              <Animated.View
                style={[
                  styles.populationDigitStrip,
                  {
                    height: (column.steps + 1) * lineHeight,
                    transform: [{
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -column.steps * lineHeight],
                        extrapolate: "clamp"
                      })
                    }]
                  }
                ]}
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
              </Animated.View>
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
