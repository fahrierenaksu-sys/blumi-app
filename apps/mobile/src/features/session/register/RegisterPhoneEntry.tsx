import type { RefObject } from "react"
import {
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native"
import { CountryCallingCodePicker } from "../../../components/CountryCallingCodePicker"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import type { AccountRecoveryLocale } from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import type {
  LocalPhoneAnalysis,
  PhoneCountryCode,
  PhoneCountryOption
} from "../registerFlowModel"
import {
  getLocalPhonePlaceholder,
  getPhoneErrorMessage
} from "../registerPresentationModel"
import { registerStyles as styles } from "./registerStyles"

/** Country calling code, local number field, inline validation and hint. */
export function RegisterPhoneEntry({
  authCopy,
  locale,
  busy,
  containerStyle,
  selectedCountryCode,
  selectedCountry,
  phoneNumber,
  phoneAnalysisError,
  phoneControlInvalid,
  showPhoneError,
  phoneInputRef,
  onCountrySelect,
  onPhoneChange,
  onPhoneBlur,
  onSubmit
}: {
  authCopy: AuthEntryCopy
  locale: AccountRecoveryLocale
  busy: boolean
  containerStyle: StyleProp<ViewStyle>
  selectedCountryCode: PhoneCountryCode
  selectedCountry: PhoneCountryOption
  phoneNumber: string
  phoneAnalysisError: LocalPhoneAnalysis["error"]
  phoneControlInvalid: boolean
  showPhoneError: boolean
  phoneInputRef: RefObject<TextInput | null>
  onCountrySelect: (countryCode: PhoneCountryCode) => void
  onPhoneChange: (value: string) => void
  onPhoneBlur: () => void
  onSubmit: () => void
}) {
  return (
    <View testID="register-phone-step" style={containerStyle}>
      <Text maxFontSizeMultiplier={1.5} style={styles.phoneLabel}>
        {authCopy.phoneNumberLabel(selectedCountry.name)}
      </Text>
      <View
        style={[
          styles.phoneControl,
          phoneControlInvalid
            ? styles.phoneControlError
            : null
        ]}
      >
        <CountryCallingCodePicker
          language={locale}
          disabled={busy}
          selectedCountry={selectedCountryCode}
          onSelect={onCountrySelect}
        />
        <View style={styles.phoneDivider} />
        <TextInput
          accessibilityLabel={authCopy.localPhoneAccessibilityLabel(selectedCountry.name)}
          value={phoneNumber}
          onChangeText={onPhoneChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder={getLocalPhonePlaceholder(selectedCountryCode, authCopy.localPhonePlaceholder)}
          placeholderTextColor={uiTheme.colors.textMuted}
          editable={!busy}
          maxLength={24}
          maxFontSizeMultiplier={1.5}
          onBlur={onPhoneBlur}
          onSubmitEditing={onSubmit}
          ref={phoneInputRef}
          style={styles.phoneInput}
        />
      </View>
      {showPhoneError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.phoneError}
        >
          {getPhoneErrorMessage(phoneAnalysisError, selectedCountry.name, authCopy)}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={1.5} style={styles.phoneHint}>
        {selectedCountryCode === "TR"
          ? authCopy.trPhoneHint
          : authCopy.automaticCallingCodeHint(selectedCountry.callingCode)}
      </Text>
    </View>
  )
}
