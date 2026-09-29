import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import type { AuthEntryCopy } from "../authEntryCopy"
import {
  resolveOtpCells,
  resolveResendControl,
  type RegisterCodeRequestStatus
} from "./registerScreenModel"
import { registerStyles as styles } from "./registerStyles"

/**
 * Sent-code status, the six-cell one-time-code field, and resend with its
 * cooldown. The code value stays with the flow controller because the primary
 * action's enabled state and the verification submit both depend on it.
 */
export function RegisterOtpEntry({
  authCopy,
  busy,
  containerStyle,
  codeRequestStatus,
  smsNotice,
  maskedPhoneNumber,
  verificationCode,
  otpFocused,
  showOtpError,
  resendCooldownSeconds,
  onChangePhoneNumber,
  onCodeChange,
  onOtpFocus,
  onOtpBlur,
  onSubmit,
  onResend
}: {
  authCopy: AuthEntryCopy
  busy: boolean
  containerStyle: StyleProp<ViewStyle>
  codeRequestStatus: RegisterCodeRequestStatus
  smsNotice: string | null
  maskedPhoneNumber: string
  verificationCode: string
  otpFocused: boolean
  showOtpError: boolean
  resendCooldownSeconds: number
  onChangePhoneNumber: () => void
  onCodeChange: (value: string) => void
  onOtpFocus: () => void
  onOtpBlur: () => void
  onSubmit: () => void
  onResend: () => void
}) {
  const resend = resolveResendControl(resendCooldownSeconds, busy, authCopy)
  return (
    <View testID="register-code-step" style={containerStyle}>
      <View style={styles.sentCard}>
        <View style={styles.sentIcon}>
          <Ionicons
            accessible={false}
            name={codeRequestStatus === "sent" ? "checkmark" : "ellipsis-horizontal"}
            size={15}
            color={uiTheme.colors.successInk}
          />
        </View>
        <View style={styles.sentCopy}>
          <Text maxFontSizeMultiplier={1.5} style={styles.sentTitle}>
            {smsNotice ?? authCopy.codeSent}
          </Text>
          <Text maxFontSizeMultiplier={1.5} style={styles.sentNumber}>
            {maskedPhoneNumber}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={authCopy.changePhoneNumber}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onChangePhoneNumber}
          hitSlop={8}
          style={({ pressed }) => [
            styles.changeButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Text style={styles.changeButtonText}>{authCopy.edit}</Text>
        </Pressable>
      </View>

      <View style={styles.otpField}>
        <Text maxFontSizeMultiplier={1.5} style={styles.otpLabel}>
          {authCopy.sixDigitCode}
        </Text>
        <View style={styles.otpInputShell}>
          <TextInput
            accessibilityLabel={authCopy.sixDigitCodeAccessibilityLabel}
            value={verificationCode}
            onChangeText={onCodeChange}
            onFocus={onOtpFocus}
            onBlur={onOtpBlur}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            editable={!busy}
            maxFontSizeMultiplier={1.5}
            caretHidden
            maxLength={6}
            onSubmitEditing={onSubmit}
            style={styles.otpNativeInput}
          />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.otpCells}
          >
            {resolveOtpCells(verificationCode, otpFocused).map((cell, index) => (
              <View
                key={index}
                testID={`register-otp-cell-${index}`}
                style={[
                  styles.otpCell,
                  cell.digit ? styles.otpCellFilled : null,
                  cell.active ? styles.otpCellActive : null
                ]}
              >
                <Text maxFontSizeMultiplier={1.5} style={styles.otpDigit}>
                  {cell.digit}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {showOtpError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.otpError}
          >
            {authCopy.completeCodeError}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resend.accessibilityLabel}
        accessibilityState={{
          disabled: resend.disabled,
          busy
        }}
        disabled={resend.disabled}
        onPress={onResend}
        hitSlop={8}
        style={({ pressed }) => [
          styles.resendButton,
          pressed ? styles.controlPressed : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.5} style={styles.resendText}>
          {resend.label}
        </Text>
      </Pressable>
    </View>
  )
}
