import Ionicons from "@expo/vector-icons/Ionicons"
import { Component, type ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "./theme"
import { captureAppException } from "../observability/crashReporting"
import { getAppLocale, type AppLocale } from "../features/session/appLocale"
import { getErrorBoundaryCopy } from "./errorBoundaryCopy"

interface ErrorBoundaryProps {
  children: ReactNode
  locale?: AppLocale
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  recoveryAttempts: number
}

/**
 * Graceful error boundary — catches unhandled React errors
 * and shows a branded recovery screen instead of crashing.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, recoveryAttempts: 0 }
  }

  static getDerivedStateFromError(error: Error): Pick<ErrorBoundaryState, "hasError" | "error"> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureAppException(error, { componentStack: info.componentStack ?? undefined })

    console.error("[Blumi ErrorBoundary]", error, info.componentStack)
  }

  private handleRecover = (): void => {
    if (this.state.recoveryAttempts > 0) return
    this.setState({ hasError: false, error: null, recoveryAttempts: 1 })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const copy = getErrorBoundaryCopy(this.props.locale ?? getRecoveryLocale(), this.state.recoveryAttempts > 0)
      return (
        <View style={styles.root}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                name="sparkles"
                size={30}
                color={uiTheme.colors.primaryDeep}
              />
            </View>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>
              {copy.body}
            </Text>
            {copy.canRetry ? <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.retryLabel}
              style={({ pressed }) => [
                styles.recoverButton,
                pressed ? { opacity: 0.88 } : null
              ]}
              onPress={this.handleRecover}
            >
              <Text style={styles.recoverText}>{copy.retryLabel}</Text>
            </Pressable> : null}
          </View>
        </View>
      )
    }

    return this.props.children
  }
}

function getRecoveryLocale(): AppLocale {
  try { return getAppLocale() } catch { return "en" }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF5FA",
    paddingHorizontal: uiTheme.spacing.xl
  },
  card: {
    width: "100%",
    borderRadius: uiTheme.radius.xxl,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.84)",
    padding: uiTheme.spacing.xl,
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    ...uiTheme.shadow.card
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primarySoft,
    marginBottom: uiTheme.spacing.xs
  },
  title: {
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading,
    fontWeight: "800",
    textAlign: "center"
  },
  body: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall,
    textAlign: "center",
    lineHeight: 20
  },
  recoverButton: {
    paddingHorizontal: uiTheme.spacing.xxl,
    paddingVertical: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.primary,
    marginTop: uiTheme.spacing.sm
  },
  recoverText: {
    color: "#FFFFFF",
    ...uiTheme.font.body,
    fontWeight: "800"
  }
})
