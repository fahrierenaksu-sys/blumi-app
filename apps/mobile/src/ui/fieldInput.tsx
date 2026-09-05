import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef, useState, type ComponentProps } from "react"
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native"
import { blumiEntryTheme as uiTheme } from "./theme"

interface FieldInputProps extends Omit<TextInputProps, "style"> {
  label: string
  labelAlign?: "left" | "center"
  helper?: string
  error?: string
  containerStyle?: StyleProp<ViewStyle>
  icon?: ComponentProps<typeof Ionicons>["name"]
}

export function FieldInput(props: FieldInputProps) {
  const {
    label,
    labelAlign = "left",
    helper,
    error,
    containerStyle,
    icon,
    onFocus,
    onBlur,
    ...inputProps
  } = props
  const [focused, setFocused] = useState(false)
  const borderAnim = useRef(new Animated.Value(0)).current

  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
    setFocused(true)
    Animated.spring(borderAnim, {
      toValue: 1,
      useNativeDriver: false,
      ...uiTheme.animation.spring,
    }).start()
    onFocus?.(event)
  }

  const handleBlur: NonNullable<TextInputProps["onBlur"]> = (event) => {
    setFocused(false)
    Animated.spring(borderAnim, {
      toValue: 0,
      useNativeDriver: false,
      ...uiTheme.animation.spring,
    }).start()
    onBlur?.(event)
  }

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [uiTheme.colors.border, uiTheme.colors.actionDark],
  })

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, labelAlign === "center" ? styles.labelCentered : null]}>
        {label}
      </Text>
      <Animated.View
        style={[
          styles.inputWrapper,
          { borderColor },
          focused ? styles.inputWrapperFocused : null,
          error ? styles.inputWrapperError : null,
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
