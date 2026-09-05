import { StyleSheet, Text, View } from "react-native"
import type { AccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { blumiEntryTheme as uiTheme } from "../ui/theme"

const STEPS: Record<AccountRecoveryLocale, readonly string[]> = {
  en: ["Profile", "Avatar", "Room", "Account"],
  tr: ["Profil", "Karakter", "Oda", "Hesap"]
}

interface OnboardingProgressProps {
  activeStep: 0 | 1 | 2 | 3
  locale?: AccountRecoveryLocale
}

export function OnboardingProgress({
  activeStep,
  locale = "en"
}: OnboardingProgressProps) {
  const steps = STEPS[locale]
  return (
    <View
      accessible
      accessibilityLabel={
        locale === "tr"
          ? `Kurulum adımı ${activeStep + 1} / ${steps.length}: ${steps[activeStep]}`
          : `Setup step ${activeStep + 1} of ${steps.length}: ${steps[activeStep]}`
      }
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 1,
        max: steps.length,
        now: activeStep + 1,
        text: steps[activeStep]
      }}
      style={styles.root}
    >
      {steps.map((step, index) => (
        <View key={step} style={styles.step}>
          <View
            style={[
              styles.dot,
              index <= activeStep ? styles.dotActive : null
            ]}
          />
          <Text
            style={[
              styles.label,
              index === activeStep ? styles.labelActive : null
            ]}
          >
            {step}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: uiTheme.spacing.xs
  },
  step: {
    flex: 1,
    alignItems: "center",
    gap: uiTheme.spacing.xxs
  },
  dot: {
    width: "100%",
    height: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.borderStrong
  },
  dotActive: {
    backgroundColor: uiTheme.colors.primary
  },
  label: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted
  },
  labelActive: {
    color: uiTheme.colors.primaryDeep
  }
})
