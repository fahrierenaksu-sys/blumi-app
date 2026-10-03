import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import { StyleSheet, TextInput, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { hapticSelection } from "../../../ui/haptics"
import { animateTo, useMotion } from "../../../ui/motion"
import { GesturePressableScale } from "../../../ui/GesturePressableScale"
import { PressableScale } from "../../../ui/PressableScale"
import { reconcileComposerTextAfterSend } from "../../chat/thread/chatComposerDraftModel"
import type { ChatDraftTyping } from "../../chat/typing/useChatDraftTyping"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { FailedRoomMessage } from "../useInRoomChat"
import {
  MINI_ROOM_INPUT_LINE_HEIGHT,
  MINI_ROOM_INPUT_VERTICAL_PADDING,
  MINI_ROOM_MAX_TEXT_SCALE,
  type MiniRoomPanelMode
} from "./miniRoomLayout"

export const MAX_ROOM_MESSAGE_LENGTH = 140
const TOGGLE_INK = "#806780"
/** Scale the send button springs back from after a send (as in the chat composer). */
const SEND_POP_SCALE = 0.8

/** The MiniRoom composer row: history toggle, message field and send. */
export interface RoomChatComposerProps {
  copy: MiniRoomCopy
  /** Optional controlled mode; the room uses the retained local draft. */
  value?: string
  suggestionsEnabled: boolean
  disabled: boolean
  mode: MiniRoomPanelMode
  maxInputHeight: number
  inputHeight: number
  onChangeText?: (value: string) => void
  /** Sends the draft; true when the message was accepted. */
  onSubmit: (body: string, retryClientMessageId?: string) => boolean
  failedMessages?: readonly FailedRoomMessage[]
  onToggleHistory: () => void
  onContentHeightChange: (contentHeight: number) => void
  /** Typing signal for the partner (chat_typing); never sees restored text. */
  draftTyping?: ChatDraftTyping
}

export const RoomChatComposer = memo(function RoomChatComposer(props: RoomChatComposerProps) {
  const {
    copy,
    value: controlledValue,
    suggestionsEnabled,
    disabled,
    mode,
    maxInputHeight,
    inputHeight,
    onChangeText,
    onSubmit,
    onToggleHistory,
    onContentHeightChange,
    draftTyping,
    failedMessages = NO_FAILED_MESSAGES
  } = props
  // Keystrokes belong to this boundary, never the room or transcript.
  const [localValue, setLocalValue] = useState("")
  const value = controlledValue ?? localValue
  const retryIdentity = useRef<FailedRoomMessage | null>(null)
  const offeredFailures = useRef(new WeakSet<FailedRoomMessage>())
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
  const motion = useMotion()
  // The press itself is GesturePressableScale's (the shared `press` token);
  // this outer scale only carries the post-send pop, so the two never fight
  // (the chat composer's pattern, MOTION_PLAN §D.4).
  const sendPop = useSharedValue(1)
  const sendPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendPop.value }] }))
  // One send, one haptic (ui/haptics: a chat message sent → selection) and one
  // pop, from the send button or the keyboard's return key alike. Reduce
  // Motion keeps the button still; the haptic stays.
  // The draft of the last accepted send while a late keystroke may still
  // bring it back (chatComposerDraftModel, as in the chat composer); null
  // otherwise.
  const sentDraft = useRef<string | null>(null)
  // What the input shows, also between a native change and React's commit.
  const shownText = useRef(value)
  useLayoutEffect(() => {
    shownText.current = value
  }, [value])
  useEffect(() => {
    if (shownText.current.length > 0) return
    const failed = failedMessages.find((message) => !offeredFailures.current.has(message))
    if (!failed) return
    offeredFailures.current.add(failed)
    retryIdentity.current = failed
    sentDraft.current = null
    shownText.current = failed.body
    setLocalValue(failed.body)
    onChangeText?.(failed.body)
  }, [failedMessages, onChangeText, value])
  const submit = () => {
    const draft = shownText.current
    const body = draft.trim()
    if (!body || disabled) return
    const retry = retryIdentity.current
    const retryClientMessageId = retry?.body === body ? retry.clientMessageId : undefined
    if (onSubmit(body, retryClientMessageId)) {
      retryIdentity.current = null
      sentDraft.current = draft
      shownText.current = ""
      // Clear the native field too, not only the controlled value.
      inputRef.current?.clear()
      setLocalValue("")
      onChangeText?.("")
      hapticSelection()
      if (!motion.reduceMotion) {
        sendPop.value = SEND_POP_SCALE
        sendPop.value = animateTo(1, motion.snappy)
      }
    }
    draftTyping?.endDraft()
  }
  const sendDisabled = disabled || value.trim().length === 0
  // Name what the button does: typing closes the keyboard; history jumps to the newest message.
  const toggleLabel = mode === "typing" ? copy.returnToRoom : copy.goToLatestMessage
  return (
    <View style={styles.composerRow}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        hitSlop={6}
        onPress={() => {
          hapticSelection()
          onToggleHistory()
        }}
        style={styles.historyToggle}
      >
        <Ionicons
          name={mode === "typing" ? "chatbubbles-outline" : "chevron-down"}
          size={18}
          color={TOGGLE_INK}
        />
      </PressableScale>
      <View style={styles.inputWrap}>
      <Ionicons name="happy-outline" size={20} color="#8D7794" accessible={false} />
      <TextInput
        ref={inputRef}
        autoCorrect={suggestionsEnabled}
        spellCheck={suggestionsEnabled}
        accessibilityLabel={copy.roomMessage}
        value={value}
        onChangeText={(next) => {
          const reconciled = reconcileComposerTextAfterSend({
            next,
            current: shownText.current,
            sentDraft: sentDraft.current
          })
          sentDraft.current = reconciled.sentDraft
          const text = reconciled.text.slice(0, MAX_ROOM_MESSAGE_LENGTH)
          if (retryIdentity.current?.body !== text.trim()) retryIdentity.current = null
          shownText.current = text
          setLocalValue(text)
          onChangeText?.(text)
          draftTyping?.noteDraft(text)
        }}
        onBlur={draftTyping?.endDraft}
        // The scene opens with the keyboard itself (useMiniRoomKeyboard), never ahead of it.
        onSubmitEditing={submit}
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
      <Animated.View style={sendPopStyle}>
        {/* Gesture Handler: the composer rides the keyboard on Reanimated
            transforms that RN Pressable's touch tracking cannot see, so its
            first tap could be dropped (ui/GesturePressableScale). */}
        <GesturePressableScale
          accessibilityRole="button"
          accessibilityLabel={copy.sendRoomMessage}
          accessibilityState={{ disabled: sendDisabled }}
          disabled={sendDisabled}
          hitSlop={4}
          onPress={submit}
          style={[styles.composerSend, sendDisabled ? styles.composerSendDisabled : null]}
        >
          <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
        </GesturePressableScale>
      </Animated.View>
    </View>
  )
})

const NO_FAILED_MESSAGES: readonly FailedRoomMessage[] = []

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
  composerSendDisabled: { backgroundColor: "#DDCFDF" }
})
