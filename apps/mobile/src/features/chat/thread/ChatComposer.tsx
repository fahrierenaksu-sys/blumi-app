import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useRef, useState } from "react"
import { Pressable, TextInput, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { LinearGradient } from "../../../ui/linearGradient"
import { uiTheme } from "../../../ui/theme"
import { GesturePressableScale } from "../../../ui/GesturePressableScale"
import { animateTo, useMotion } from "../../../ui/motion"
import { getRoomInviteCreateLabel, type ChatLocale } from "../chatRoomInviteModel"
import type { ChatDraftTyping } from "../typing/useChatDraftTyping"
import { CHAT_COMPOSER_MAX_LENGTH, readChatComposerDraft, writeChatComposerDraft } from "../chatComposerDraftStore"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { reconcileComposerTextAfterSend } from "./chatComposerDraftModel"
import { styles } from "./chatThreadStyles"
import { RoomInviteComposerIcon } from "./RoomInviteComposerIcon"

/** Scale the send button springs back from after a send: a subtle pop (MOTION_PLAN §D.4). */
const SEND_POP_SCALE = 0.9

/**
 * Owns the draft text so typing never re-renders the timeline owner. With a
 * draft owner (account + conversation) the unsent text survives leaving the
 * conversation, in memory only (chatComposerDraftStore).
 */
export function ChatComposer({
  draftAccountId,
  draftThreadId,
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
  /** The signed-in account the draft belongs to. */
  draftAccountId?: string
  /** The conversation the draft belongs to; none while it is still being created. */
  draftThreadId?: string
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
  // A restored draft is shown as the input's value only: no native change
  // event, so it never reaches draftTyping as typing.
  const [restoredDraft] = useState(() => readChatComposerDraft(draftAccountId ?? "", draftThreadId ?? ""))
  const [inputText, setInputText] = useState(restoredDraft)
  const inputRef = useRef<TextInput>(null)
  // The draft of the last send while a late keystroke may still bring it
  // back (chatComposerDraftModel); null otherwise.
  const sentDraftRef = useRef<string | null>(null)
  // What the input shows, also between a send and the next render.
  const shownTextRef = useRef(restoredDraft)
  const draftOwnerRef = useRef({ accountId: draftAccountId, threadId: draftThreadId })
  const previousOwner = draftOwnerRef.current
  if (previousOwner.accountId !== draftAccountId || previousOwner.threadId !== draftThreadId) {
    draftOwnerRef.current = { accountId: draftAccountId, threadId: draftThreadId }
    // Another conversation (or account) shows its own draft. A conversation
    // that was still being created keeps what was typed meanwhile.
    if (previousOwner.threadId !== undefined || previousOwner.accountId !== draftAccountId) {
      const ownerDraft = readChatComposerDraft(draftAccountId ?? "", draftThreadId ?? "")
      shownTextRef.current = ownerDraft
      sentDraftRef.current = null
      setInputText(ownerDraft)
    }
  }
  // Every shown text is remembered, so an accepted send forgets the draft
  // and a refused one keeps it.
  useEffect(() => {
    if (draftAccountId && draftThreadId) writeChatComposerDraft(draftAccountId, draftThreadId, shownTextRef.current)
  }, [draftAccountId, draftThreadId, inputText])
  const motion = useMotion()
  // The press itself is GesturePressableScale's (the shared `press` token,
  // with a still hit target); this outer scale carries only the post-send
  // pop, after the message has been accepted, so the two never fight.
  const sendPop = useSharedValue(1)
  const sendPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendPop.value }] }))
  const isSendDisabled = inputText.trim().length === 0 || isPendingThread

  const handleSend = (): boolean => {
    // A native edit can arrive after touch-down, before React replaces the
    // button's callback. Submit the current draft, never that render's text.
    const draft = shownTextRef.current
    const body = draft.trim()
    if (!body || isPendingThread) return false
    if (!onSend(body)) return false
    sentDraftRef.current = draft
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
            maxLength={CHAT_COMPOSER_MAX_LENGTH}
          />
        </View>
        <Animated.View style={sendPopStyle}>
          {/* Gesture Handler: the footer rides the keyboard on Reanimated
              transforms that RN Pressable's touch tracking cannot see, so
              its first tap could be dropped (ui/GesturePressableScale). */}
          <GesturePressableScale
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
          </GesturePressableScale>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}
