import Ionicons from "@expo/vector-icons/Ionicons"
import { useState, type RefObject } from "react"
import { Pressable, TextInput, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { LinearGradient } from "../../../ui/linearGradient"
import { uiTheme } from "../../../ui/theme"
import { animateTo, MOTION_PRESS_SCALE, useMotion } from "../../../ui/motion"
import { getRoomInviteCreateLabel, type ChatLocale } from "../chatRoomInviteModel"
import type { ChatDraftTyping } from "../typing/useChatDraftTyping"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"
import { RoomInviteComposerIcon } from "./RoomInviteComposerIcon"

/** Scale the send button springs back from after a send (MOTION_PLAN §D.4). */
const SEND_POP_SCALE = 0.8

/**
 * Owns the draft text so typing never re-renders the timeline owner. The
 * input surface (`surfaceRef`) is where a send flight starts.
 */
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
  draftTyping,
  surfaceRef
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
  /** The input's surface, measured as the start of the send flight. */
  surfaceRef?: RefObject<View | null>
}) {
  const [inputText, setInputText] = useState("")
  const motion = useMotion()
  const sendScale = useSharedValue(1)
  const sendScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }))
  const isSendDisabled = inputText.trim().length === 0 || isPendingThread

  const handleSend = (): boolean => {
    const body = inputText.trim()
    if (!body || isPendingThread) return false
    if (!onSend(body)) return false
    setInputText("")
    return true
  }

  // UI-thread springs; Reduce Motion keeps the button still (the haptic stays).
  const handleSendPressIn = () => {
    if (motion.reduceMotion) return
    sendScale.value = animateTo(MOTION_PRESS_SCALE, motion.press)
  }

  const handleSendPressOut = () => {
    if (motion.reduceMotion) return
    sendScale.value = animateTo(1, motion.press)
  }

  // An accepted send answers with a small pop back to rest.
  const popSendButton = () => {
    if (motion.reduceMotion) return
    sendScale.value = SEND_POP_SCALE
    sendScale.value = animateTo(1, motion.snappy)
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
        <View ref={surfaceRef} style={styles.inputWrap}>
          <TextInput
            accessibilityLabel={chatCopy.messageAccessibilityLabel(partnerName)}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            onChange={draftTyping ? (event) => draftTyping.noteDraft(event.nativeEvent.text) : undefined}
            onBlur={draftTyping?.endDraft}
            placeholder={chatCopy.messagePlaceholder}
            placeholderTextColor={uiTheme.colors.textMuted}
            multiline
            maxLength={500}
          />
        </View>
        <Animated.View style={sendScaleStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatCopy.sendAccessibilityLabel(partnerName)}
            accessibilityState={{ disabled: isSendDisabled }}
            onPress={() => {
              if (handleSend()) popSendButton()
              draftTyping?.endDraft()
            }}
            onPressIn={handleSendPressIn}
            onPressOut={handleSendPressOut}
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
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}
