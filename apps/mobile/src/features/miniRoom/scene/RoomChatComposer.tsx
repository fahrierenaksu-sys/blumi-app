import Ionicons from "@expo/vector-icons/Ionicons"
import { memo } from "react"
import { Pressable, StyleSheet, TextInput, View } from "react-native"
import { wardrobeTheme } from "../../avatarV2/wardrobe/wardrobeV2Styles"
import { uiTheme } from "../../../ui/theme"
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
  disabled: boolean
  mode: MiniRoomPanelMode
  maxInputHeight: number
  onChangeText: (value: string) => void
  onSubmit: () => void
  onToggleHistory: () => void
  onContentHeightChange: (contentHeight: number) => void
  /** Typing signal for the partner (chat_typing); never sees restored text. */
  draftTyping?: ChatDraftTyping
}

export const RoomChatComposer = memo(function RoomChatComposer(props: RoomChatComposerProps) {
  const {
    copy,
    value,
    disabled,
    mode,
    maxInputHeight,
    onChangeText,
    onSubmit,
    onToggleHistory,
    onContentHeightChange,
    draftTyping
  } = props
  const sendDisabled = disabled || value.trim().length === 0
  const historyOpen = mode === "history"
  const toggleLabel = mode === "typing"
    ? copy.returnToRoom
    : historyOpen ? copy.hideChatHistory : copy.openChatHistory
  return (
    <View style={[styles.composerRow, mode === "compact" ? null : styles.composerBox]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded: historyOpen }}
        hitSlop={6}
        onPress={onToggleHistory}
        style={({ pressed }) => [
          styles.historyToggle,
          mode === "compact" ? null : styles.historyToggleOpen,
          pressed ? styles.composerButtonPressed : null
        ]}
      >
        <Ionicons
          name={mode === "compact" ? "chatbubbles-outline" : "chevron-down"}
          size={18}
          color={TOGGLE_INK}
        />
      </Pressable>
      <TextInput
        accessibilityLabel={copy.roomMessage}
        value={value}
        onChangeText={(text) => {
          onChangeText(text)
          draftTyping?.noteDraft(text)
        }}
        onBlur={draftTyping?.endDraft}
        onSubmitEditing={() => {
          onSubmit()
          draftTyping?.endDraft()
        }}
        onContentSizeChange={(event) => onContentHeightChange(event.nativeEvent.contentSize.height)}
        placeholder={copy.roomMessagePlaceholder}
        placeholderTextColor="#8B7A8A"
        maxLength={MAX_ROOM_MESSAGE_LENGTH}
        maxFontSizeMultiplier={MINI_ROOM_MAX_TEXT_SCALE}
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        enablesReturnKeyAutomatically
        style={[styles.composerInput, { maxHeight: maxInputHeight }]}
        editable={!disabled}
        keyboardAppearance="light"
      />
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
  /* ── Composer ────────────── */
  composerRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4
  },
  composerBox: {
    padding: 4,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "#F6F2F7",
    experimental_backgroundImage: "linear-gradient(145deg, #F3EEF4 0%, #F9F6FB 100%)"
  },
  historyToggle: {
    width: 32,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  historyToggleOpen: {
    width: 34,
    height: 34,
    marginVertical: 2,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(255, 248, 252, 0.55)"
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    paddingTop: MINI_ROOM_INPUT_VERTICAL_PADDING,
    paddingBottom: MINI_ROOM_INPUT_VERTICAL_PADDING,
    paddingHorizontal: 4,
    color: wardrobeTheme.ink,
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontSize: 14,
    lineHeight: MINI_ROOM_INPUT_LINE_HEIGHT,
    textAlignVertical: "center"
  },
  composerSend: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.brandPlum,
    shadowColor: uiTheme.colors.brandPlum,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  composerSendDisabled: {
    opacity: 0.45,
  },
  composerButtonPressed: {
    transform: [{ scale: 0.92 }],
  }
})
