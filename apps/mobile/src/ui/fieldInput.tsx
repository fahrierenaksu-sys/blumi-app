import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState, type ComponentProps, type Ref } from "react"
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native"
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "./theme"

const FIELD_FOCUS_COLOR_DURATION_MS = 120
const FIELD_BORDER_COLOR = uiTheme.colors.border
const FIELD_FOCUSED_BORDER_COLOR = uiTheme.colors.actionDark
const FIELD_ERROR_BORDER_COLOR = uiTheme.colors.danger

interface FieldInputProps extends Omit<TextInputProps, "style"> {
  label: string
  labelAlign?: "left" | "center"
  helper?: string
  error?: string
  containerStyle?: StyleProp<ViewStyle>
  icon?: ComponentProps<typeof Ionicons>["name"]
  /** Lets a form move focus to this field (return key "next"). */
  inputRef?: Ref<TextInput>
}

export function FieldInput(props: FieldInputProps) {
  const {
    label,
    labelAlign = "left",
    helper,
    error,
    containerStyle,
    icon,
    inputRef,
    onFocus,
    onBlur,
    ...inputProps
  } = props
  const [focused, setFocused] = useState(false)
  // Focus colour crossfades on the UI thread. A colour fade is not movement,
  // so it runs under Reduce Motion as the JS spring did.
  const focusProgress = useSharedValue(0)
  useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, {
      duration: FIELD_FOCUS_COLOR_DURATION_MS,
      reduceMotion: ReduceMotion.Never
    })
  }, [focusProgress, focused])
  const hasError = Boolean(error)
  // An animated style wins over static styles, so the error colour lives here too.
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: hasError
      ? FIELD_ERROR_BORDER_COLOR
      : interpolateColor(focusProgress.value, [0, 1], [FIELD_BORDER_COLOR, FIELD_FOCUSED_BORDER_COLOR])
  }))

  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
    setFocused(true)
    onFocus?.(event)
  }

  const handleBlur: NonNullable<TextInputProps["onBlur"]> = (event) => {
    setFocused(false)
    onBlur?.(event)
  }

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, labelAlign === "center" ? styles.labelCentered : null]}>
        {label}
      </Text>
      <Animated.View
        style={[
          styles.inputWrapper,
          focused ? styles.inputWrapperFocused : null,
          error ? styles.inputWrapperError : null,
          borderStyle,
        ]}
      >
        {icon ? (
          <View style={styles.iconWrap}>
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name={icon}
              size={16}
              color={uiTheme.colors.textSecondary}
            />
          </View>
        ) : null}
        <TextInput
          {...inputProps}
          ref={inputRef}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          placeholderTextColor={uiTheme.colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.input, icon ? styles.inputWithIcon : null]}
        />
      </Animated.View>
      {error ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.errorRow}
        >
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name="alert-circle"
            size={14}
            color={uiTheme.colors.danger}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: uiTheme.spacing.xs,
  },
  label: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary,
  },
  labelCentered: {
    textAlign: "center",
  },
  inputWrapper: {
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1.5,
    borderColor: uiTheme.colors.border,
    backgroundColor: uiTheme.colors.surface,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  inputWrapperFocused: {
    backgroundColor: uiTheme.colors.surfaceRaised,
    ...uiTheme.shadow.soft,
  },
  inputWrapperError: {
    borderColor: uiTheme.colors.danger,
    backgroundColor: "#FFF8F9",
  },
  iconWrap: {
    alignSelf: "center",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(248, 239, 250, 0.94)",
    borderColor: "rgba(216, 191, 218, 0.42)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: uiTheme.spacing.xs,
    // iOS TextInput's font metrics sit a few pixels below the flex center.
    // Nudge the icon chip to the same optical baseline in every field.
    transform: [{ translateY: 3 }],
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodyMedium,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  helperText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    paddingLeft: 2,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 2,
  },
  errorText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    fontWeight: "600",
  },
})
