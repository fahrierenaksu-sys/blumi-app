import { useEffect, useState } from "react"
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useMotion } from "../../ui/motion"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { StreetCopy } from "./streetCopy"
import { STREET_NOTE_MAX_LENGTH, normalizeStreetNote, streetNoteCharactersLeft } from "./streetNoteModel"

/** The editor for your own note: one line, 60 characters, share or remove. */
export function StreetNoteComposer(props: {
  visible: boolean
  current: string | null
  copy: StreetCopy
  onSave: (note: string | null) => void
  onClose: () => void
}) {
  const { visible, current, copy } = props
  const motion = useMotion()
  const [draft, setDraft] = useState(current ?? "")
  useEffect(() => {
    if (visible) setDraft(current ?? "")
  }, [current, visible])
  const note = normalizeStreetNote(draft)
  return (
    <Modal visible={visible} transparent animationType={motion.reduceMotion ? "fade" : "slide"} onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={copy.cancel} onPress={props.onClose} />
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{copy.leaveNote}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={copy.notePlaceholder}
            placeholderTextColor={uiTheme.colors.textMuted}
            autoFocus
            maxLength={STREET_NOTE_MAX_LENGTH + 10}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => { if (note) props.onSave(note) }}
            style={styles.input}
          />
          <Text style={styles.counter}>{streetNoteCharactersLeft(draft)}</Text>
          <View style={styles.actions}>
            {current ? (
              <Pressable accessibilityRole="button" onPress={() => props.onSave(null)} style={styles.secondary}>
                <Text style={styles.removeText}>{copy.removeNote}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={props.onClose} style={styles.secondary}>
                <Text style={styles.secondaryText}>{copy.cancel}</Text>
              </Pressable>
            )}
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ disabled: note === null }}
              disabled={note === null}
              onPress={() => props.onSave(note)}
              style={[styles.share, note === null && styles.shareDisabled]}
            >
              <Text style={styles.shareText}>{copy.shareNote}</Text>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: uiTheme.colors.overlaySoft },
  card: { backgroundColor: uiTheme.colors.surface, padding: 20, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 10 },
  title: { color: uiTheme.colors.textPrimary, fontSize: 18, fontWeight: "700" },
  input: {
    color: uiTheme.colors.textPrimary,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: uiTheme.colors.surfaceSoft
  },
  counter: { alignSelf: "flex-end", color: uiTheme.colors.textMuted, fontSize: 12 },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  secondary: { paddingVertical: 10, paddingHorizontal: 4 },
  secondaryText: { color: uiTheme.colors.textSecondary, fontWeight: "600" },
  removeText: { color: uiTheme.colors.danger, fontWeight: "600" },
  share: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 20, backgroundColor: uiTheme.colors.primary },
  shareDisabled: { opacity: 0.4 },
  shareText: { color: uiTheme.colors.onPrimary, fontWeight: "700" }
})
