import Ionicons from "@expo/vector-icons/Ionicons"
import { useMemo, useState } from "react"
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import {
  filterPhoneCountryOptions,
  getPhoneCountryOptions,
  type PhoneCountryCode,
  type PhoneCountryOption
} from "../features/session/registerFlowModel"
import { blumiEntryTheme as uiTheme } from "../ui/theme"

interface CountryCallingCodePickerProps {
  selectedCountry: PhoneCountryCode
  disabled?: boolean
  onSelect: (countryCode: PhoneCountryCode) => void
  language?: "tr" | "en"
}

const COUNTRY_OPTIONS = getPhoneCountryOptions()

export function CountryCallingCodePicker({
  selectedCountry,
  disabled = false,
  onSelect,
  language = "tr"
}: CountryCallingCodePickerProps) {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState("")
  const selectedOption = COUNTRY_OPTIONS.find(
    (option) => option.countryCode === selectedCountry
  ) ?? COUNTRY_OPTIONS[0]
  const filteredOptions = useMemo(
    () => filterPhoneCountryOptions(COUNTRY_OPTIONS, query),
    [query]
  )
  const copy = language === "tr" ? {
    choose: "Ülke telefon kodunu seç",
    current: "Seçili ülke",
    close: "Ülke seçimini kapat",
    eyebrow: "TELEFON KODU",
    title: "Ülkeni seç",
    search: "Ülke ara",
    placeholder: "Ülke veya +90",
    empty: "Ülke bulunamadı"
  } : {
    choose: "Choose country calling code",
    current: "Currently",
    close: "Close country picker",
    eyebrow: "CALLING CODE",
    title: "Choose your country",
    search: "Search countries",
    placeholder: "Country or +90",
    empty: "No country found"
  }

  const close = (): void => {
    setVisible(false)
    setQuery("")
  }

  const select = (countryCode: PhoneCountryCode): void => {
    onSelect(countryCode)
    close()
  }

  return (
    <>
      <Pressable
        accessibilityLabel={copy.choose}
        accessibilityHint={`${copy.current}: ${selectedOption.name}, ${selectedOption.callingCode}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible, disabled }}
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed ? styles.pressed : null
        ]}
        testID="register-country-picker"
      >
        <View style={styles.isoBadge}>
          <Text maxFontSizeMultiplier={1.1} style={styles.flagText}>
            {selectedOption.flag}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={styles.callingCode}>
          {selectedOption.callingCode}
        </Text>
        <Ionicons
          accessible={false}
          name="chevron-down"
          size={14}
          color={uiTheme.colors.primaryDeep}
        />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={visible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityLabel={copy.close}
            accessibilityRole="button"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            style={styles.sheet}
          >
            <View pointerEvents="none" style={styles.sheetGlassTint} />
            <View pointerEvents="none" style={styles.sheetHighlight} />
            <View style={styles.header}>
              <View style={styles.titleCopy}>
                <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>
                  {copy.eyebrow}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.title}>
                  {copy.title}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={copy.close}
                accessibilityRole="button"
                onPress={close}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons
                  accessible={false}
                  name="close"
                  size={20}
                  color={uiTheme.colors.textPrimary}
                />
              </Pressable>
            </View>

            <View style={styles.searchShell}>
              <Ionicons
                accessible={false}
                name="search"
                size={18}
                color={uiTheme.colors.textMuted}
              />
              <TextInput
                accessibilityLabel={copy.search}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder={copy.placeholder}
                placeholderTextColor={uiTheme.colors.textMuted}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
            </View>

            <FlatList
              data={filteredOptions}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.countryCode}
              renderItem={({ item }) => (
                <CountryRow
                  country={item}
                  selected={item.countryCode === selectedCountry}
                  onSelect={select}
                />
              )}
              ListEmptyComponent={(
                <Text style={styles.emptyText}>{copy.empty}</Text>
              )}
              showsVerticalScrollIndicator={false}
              style={styles.list}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

function CountryRow({
  country,
  selected,
  onSelect
}: {
  country: PhoneCountryOption
  selected: boolean
  onSelect: (countryCode: PhoneCountryCode) => void
}) {
  return (
    <Pressable
      accessibilityLabel={`${country.name}, ${country.callingCode}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(country.countryCode)}
      style={({ pressed }) => [
        styles.countryRow,
        selected ? styles.countryRowSelected : null,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.countryIsoBadge}>
        <Text maxFontSizeMultiplier={1.1} style={styles.countryFlagText}>
          {country.flag}
        </Text>
      </View>
      <View style={styles.countryCopy}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.countryName}>
          {country.name}
        </Text>
        {country.nativeName !== country.name ? (
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.nativeName}>
            {country.nativeName}
          </Text>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.2} style={styles.rowCallingCode}>
        {country.callingCode}
      </Text>
      {selected ? (
        <View style={styles.checkBubble}>
          <Ionicons
            accessible={false}
            name="checkmark"
            size={15}
            color="#FFFFFF"
          />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 58,
    minWidth: 104,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  isoBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(252,227,232,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)"
  },
  flagText: {
    fontSize: 19,
    lineHeight: 22
  },
  callingCode: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textPrimary
  },
  modalRoot: {
    flex: 1,
    padding: uiTheme.spacing.lg,
    justifyContent: "center",
    backgroundColor: "rgba(50, 28, 43, 0.22)"
  },
  sheet: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "72%",
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 32,
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md,
    backgroundColor: "rgba(255,248,251,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...uiTheme.shadow.deep
  },
  sheetHighlight: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.96)"
  },
  sheetGlassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.40)"
  },
  header: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm
  },
  titleCopy: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    letterSpacing: 1.2
  },
  title: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)"
  },
  searchShell: {
    minHeight: 50,
    paddingHorizontal: uiTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.74)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.94)"
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodyMedium
  },
  list: {
    flexGrow: 0
  },
  countryRow: {
    minHeight: 58,
    paddingHorizontal: uiTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    borderRadius: 18
  },
  countryRowSelected: {
    backgroundColor: "rgba(252,227,232,0.78)"
  },
  countryIsoBadge: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)"
  },
  countryFlagText: {
    fontSize: 20,
    lineHeight: 24
  },
  countryCopy: {
    flex: 1
  },
  countryName: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary
  },
  nativeName: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted
  },
  rowCallingCode: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary
  },
  checkBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primary
  },
  emptyText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    textAlign: "center",
    paddingVertical: uiTheme.spacing.xl
  },
  pressed: {
    opacity: 0.72
  }
})
