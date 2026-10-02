import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useEffect, useRef } from "react"
import { Pressable, StyleSheet, TextInput, View } from "react-native"
import type { ChatDraftTyping } from "../../chat/typing/useChatDraftTyping"
import type { MiniRoomCopy } from "../miniRoomCopy"
import {
  MINI_ROOM_INPUT_LINE_HEIGHT,
  MINI_ROOM_INPUT_VERTICAL_PADDING,
  MINI_ROOM_MAX_TEXT_SCALE,
  type MiniRoomPanelMode
} from "./miniRoomLayout"

export const MAX_ROOM_MESSAGE_LENGTH = 140
const TOGGLE_INK = "#806780"

/** The MiniRoom composer row: history toggle, message field and send. */
interface RoomChatComposerProps {
  copy: MiniRoomCopy
  value: string
  suggestionsEnabled: boolean
  disabled: boolean
  mode: MiniRoomPanelMode
  maxInputHeight: number
  inputHeight: number
  onChangeText: (value: string) => void
  onSubmit: () => void
  onToggleHistory: () => void
  onContentHeightChange: (contentHeight: number) => void
  onFocus: () => void
  /** Typing signal for the partner (chat_typing); never sees restored text. */
  draftTyping?: ChatDraftTyping
}

export const RoomChatComposer = memo(function RoomChatComposer(props: RoomChatComposerProps) {
  const {
    copy,
    value,
    suggestionsEnabled,
    disabled,
    mode,
    maxInputHeight,
    inputHeight,
    onChangeText,
    onSubmit,
    onToggleHistory,
    onContentHeightChange,
    onFocus,
    draftTyping
  } = props
  const inputRef = useRef<TextInput>(null)
  const previousSuggestions = useRef(suggestionsEnabled)
  useEffect(() => {
    if (previousSuggestions.current === suggestionsEnabled) return
    previousSuggestions.current = suggestionsEnabled
    if (!inputRef.current?.isFocused()) return
    // UIKit applies keyboard traits reliably on a fresh focus; preserve the draft.
    inputRef.current.blur()
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [suggestionsEnabled])
  const sendDisabled = disabled || value.trim().length === 0
  const historyOpen = mode === "history"
  const toggleLabel = mode === "typing" ? copy.returnToRoom : copy.chatHistory
  return (
    <View style={styles.composerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded: historyOpen }}
        hitSlop={6}
        onPress={onToggleHistory}
        style={({ pressed }) => [
          styles.historyToggle,
          pressed ? styles.composerButtonPressed : null
        ]}
      >
        <Ionicons
          name={mode === "typing" ? "chatbubbles-outline" : "chevron-down"}
          size={18}
          color={TOGGLE_INK}
        />
      </Pressable>
      <View style={styles.inputWrap}>
      <Ionicons name="happy-outline" size={20} color="#8D7794" accessible={false} />
      <TextInput
        ref={inputRef}
        autoCorrect={suggestionsEnabled}
        spellCheck={suggestionsEnabled}
        accessibilityLabel={copy.roomMessage}
        value={value}
        onChangeText={(text) => {
          onChangeText(text)
          draftTyping?.noteDraft(text)
        }}
        onBlur={draftTyping?.endDraft}
        // A measured warm opening starts on touch-down, before UIKit focuses.
        // First focus still uses the real system frame; no guessed keyboard size.
        onTouchStart={onFocus}
        onFocus={onFocus}
        onSubmitEditing={() => {
          onSubmit()
          draftTyping?.endDraft()
        }}
        onLayout={(event) => onContentHeightChange(event.nativeEvent.layout.height)}
        placeholder={copy.roomMessagePlaceholder}
        placeholderTextColor="#8B7A8A"
        maxLength={MAX_ROOM_MESSAGE_LENGTH}
        maxFontSizeMultiplier={MINI_ROOM_MAX_TEXT_SCALE}
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        enablesReturnKeyAutomatically
        // Let Fabric measure multiline content before capping it. A fixed height
        // prevents iOS layout updates from reporting the first wrapped line.
        style={[styles.composerInput, { height: value.length === 0 ? inputHeight : undefined, maxHeight: maxInputHeight }]}
        editable={!disabled}
        keyboardAppearance="light"
      />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.sendRoomMessage}
        accessibilityState={{ disabled: sendDisabled }}
        disabled={sendDisabled}
        hitSlop={4}
        onPress={() => {
          onSubmit()
          draftTyping?.endDraft()
        }}
        style={({ pressed }) => [
          styles.composerSend,
          sendDisabled ? styles.composerSendDisabled : null,
          pressed ? styles.composerButtonPressed : null
        ]}
      >
        <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  composerRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  historyToggle: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 12, borderRadius: 24, backgroundColor: "#F5F0F8" },
  composerInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: MINI_ROOM_INPUT_VERTICAL_PADDING,
    paddingHorizontal: 0, color: "#49364A", fontFamily: "Inter_400Regular", fontSize: 14,
    lineHeight: MINI_ROOM_INPUT_LINE_HEIGHT, textAlignVertical: "center" },
  composerSend: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#F45A9F" },
  composerSendDisabled: { backgroundColor: "#DDCFDF" },
  composerButtonPressed: { opacity: 0.72 }
})
