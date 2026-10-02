import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef, useState } from "react"
import { Pressable, TextInput, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { LinearGradient } from "../../../ui/linearGradient"
import { uiTheme } from "../../../ui/theme"
import { PressableScale } from "../../../ui/PressableScale"
import { animateTo, useMotion } from "../../../ui/motion"
import { getRoomInviteCreateLabel, type ChatLocale } from "../chatRoomInviteModel"
import type { ChatDraftTyping } from "../typing/useChatDraftTyping"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { reconcileComposerTextAfterSend } from "./chatComposerDraftModel"
import { styles } from "./chatThreadStyles"
import { RoomInviteComposerIcon } from "./RoomInviteComposerIcon"

/** Scale the send button springs back from after a send (MOTION_PLAN §D.4). */
const SEND_POP_SCALE = 0.8

/** Owns the draft text so typing never re-renders the timeline owner. */
export function ChatComposer({
  chatCopy,
  partnerName,
  chatLocale,
  isPendingThread,
  canCreateRoomInvite,
  roomInviteReady = false,
  isCreatingRoomInvite,
  roomInviteDisabledReason,
  onRoomInvitePress,
  onSend,
  draftTyping
}: {
  chatCopy: ChatThreadCopy
  partnerName: string
  chatLocale: ChatLocale
  isPendingThread: boolean
  canCreateRoomInvite: boolean
  roomInviteReady?: boolean
  isCreatingRoomInvite: boolean
  roomInviteDisabledReason: string | null
  onRoomInvitePress: () => void
  onSend: (body: string) => boolean
  /** Typing signal for the partner (chat_typing); never sees programmatic text. */
  draftTyping?: ChatDraftTyping
}) {
  const [inputText, setInputText] = useState("")
  const inputRef = useRef<TextInput>(null)
  // The draft of the last send while a late keystroke may still bring it
  // back (chatComposerDraftModel); null otherwise.
  const sentDraftRef = useRef<string | null>(null)
  // What the input shows, also between a send and the next render.
  const shownTextRef = useRef("")
  const motion = useMotion()
  // The press itself is PressableScale's (the shared `press` token); this
  // outer scale only carries the post-send pop, so the two never fight.
  const sendPop = useSharedValue(1)
  const sendPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendPop.value }] }))
  const isSendDisabled = inputText.trim().length === 0 || isPendingThread

  const handleSend = (): boolean => {
    const body = inputText.trim()
    if (!body || isPendingThread) return false
    if (!onSend(body)) return false
    sentDraftRef.current = inputText
    shownTextRef.current = ""
    // The native clear empties the field in this frame; the state follows.
    inputRef.current?.clear()
    setInputText("")
    return true
  }

  const handleChangeText = (next: string) => {
    const reconciled = reconcileComposerTextAfterSend({
      next,
      current: shownTextRef.current,
      sentDraft: sentDraftRef.current
    })
    sentDraftRef.current = reconciled.sentDraft
    shownTextRef.current = reconciled.text
    setInputText(reconciled.text)
  }

  // An accepted send answers with a small pop back to rest; Reduce Motion
  // keeps the button still (the haptic stays).
  const popSendButton = () => {
    if (motion.reduceMotion) return
    sendPop.value = SEND_POP_SCALE
    sendPop.value = animateTo(1, motion.snappy)
  }

  return (
    <SafeAreaView contentGutter={false} edges={["bottom"]} style={styles.composerSafe}>
      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={getRoomInviteCreateLabel(chatLocale)}
          accessibilityHint={roomInviteDisabledReason ?? undefined}
          accessibilityState={{
            busy: isCreatingRoomInvite,
            disabled: isCreatingRoomInvite
          }}
          disabled={isCreatingRoomInvite}
          onPress={onRoomInvitePress}
          style={({ pressed }) => [
            styles.roomInviteButton,
            pressed ? styles.roomInviteButtonPressed : null,
            !canCreateRoomInvite || isCreatingRoomInvite
              ? styles.roomInviteButtonDisabled
              : null
          ]}
        >
          <RoomInviteComposerIcon ready={roomInviteReady} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            accessibilityLabel={chatCopy.messageAccessibilityLabel(partnerName)}
            style={styles.input}
            value={inputText}
            onChangeText={handleChangeText}
            onChange={draftTyping ? (event) => draftTyping.noteDraft(event.nativeEvent.text) : undefined}
            onBlur={draftTyping?.endDraft}
            placeholder={chatCopy.messagePlaceholder}
            placeholderTextColor={uiTheme.colors.textMuted}
            multiline
            maxLength={500}
          />
        </View>
        <Animated.View style={sendPopStyle}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={chatCopy.sendAccessibilityLabel(partnerName)}
            accessibilityState={{ disabled: isSendDisabled }}
            onPress={() => {
              if (handleSend()) popSendButton()
              draftTyping?.endDraft()
            }}
            disabled={isSendDisabled}
            style={({ pressed }) => [
              styles.sendButton,
              isSendDisabled ? styles.sendButtonDisabled : null,
              pressed ? styles.sendButtonPressed : null
            ]}
          >
            <LinearGradient
              colors={
                isSendDisabled
                  ? [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]
                  : uiTheme.gradients.primary as [string, string]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButtonGradient}
            >
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </LinearGradient>
          </PressableScale>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}
