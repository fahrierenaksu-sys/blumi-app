import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { hapticSelection } from "../../ui/haptics"
import { uiTheme } from "../../ui/theme"
import { addProfileInterests, removeProfileInterest } from "./profileEditModel"

/**
 * Interests as chips (DSC-9): type one and press return, or separate several
 * with commas; each chip has its own remove button. The draft stays the
 * newline-separated text the profile model validates.
 */
export function ProfileInterestsField(props: {
  interestsText: string
  interests: readonly string[]
  onChangeInterestsText: (next: string) => void
  copy: { interestsAccessibility: string; interestsPlaceholder: string; removeInterest: (interest: string) => string }
}) {
  const { interestsText, interests, onChangeInterestsText, copy } = props
  const [entry, setEntry] = useState("")
  const commit = (value: string) => {
    const next = addProfileInterests(interestsText, value)
    setEntry("")
    if (next === interestsText) return
    hapticSelection()
    onChangeInterestsText(next)
  }
  const handleChangeText = (value: string) => {
    if (/,/.test(value)) commit(value)
    else setEntry(value)
  }

  return (
    <View style={styles.wrap}>
      {interests.length > 0 ? (
        <View style={styles.chipRow}>
          {interests.map((interest) => (
            <Pressable
              key={interest}
              accessibilityRole="button"
              accessibilityLabel={copy.removeInterest(interest)}
              onPress={() => {
                hapticSelection()
                onChangeInterestsText(removeProfileInterest(interestsText, interest))
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
            >
              <Text style={styles.chipText} maxFontSizeMultiplier={1.6}>{interest}</Text>
              <Ionicons name="close" size={14} color={uiTheme.colors.chipText} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={copy.interestsAccessibility}
        style={styles.input}
        value={entry}
        onChangeText={handleChangeText}
        onSubmitEditing={() => commit(entry)}
        onBlur={() => { if (entry.trim()) commit(entry) }}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={copy.interestsPlaceholder}
        placeholderTextColor={uiTheme.colors.textMuted}
        autoCapitalize="none"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: uiTheme.spacing.sm
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs
  },
  chip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.chipBackground
  },
  chipPressed: {
    backgroundColor: uiTheme.colors.primarySoft
  },
  chipText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.chipText
  },
  input: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary,
    paddingVertical: uiTheme.spacing.xs,
    borderBottomWidth: 1.5,
    borderBottomColor: uiTheme.colors.border
  }
})
