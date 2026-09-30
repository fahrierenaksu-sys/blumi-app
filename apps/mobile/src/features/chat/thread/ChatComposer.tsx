import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef, useState } from "react"
import { Animated, Pressable, TextInput, View } from "react-native"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { LinearGradient } from "../../../ui/linearGradient"
import { uiTheme } from "../../../ui/theme"
import { useReducedMotion } from "../../../ui/animations"
import { getRoomInviteCreateLabel, type ChatLocale } from "../chatRoomInviteModel"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"

/**
 * Owns the draft text so typing never re-renders the timeline owner.
 */
export function ChatComposer({
  chatCopy,
  partnerName,
  chatLocale,
  isPendingThread,
  canCreateRoomInvite,
  isCreatingRoomInvite,
  roomInviteDisabledReason,
  onRoomInvitePress,
  onSend
}: {
  chatCopy: ChatThreadCopy
  partnerName: string
  chatLocale: ChatLocale
  isPendingThread: boolean
  canCreateRoomInvite: boolean
  isCreatingRoomInvite: boolean
  roomInviteDisabledReason: string | null
  onRoomInvitePress: () => void
  onSend: (body: string) => boolean
}) {
  const [inputText, setInputText] = useState("")
  const sendScaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()
  const isSendDisabled = inputText.trim().length === 0 || isPendingThread

  const handleSend = (): void => {
    const body = inputText.trim()
    if (!body || isPendingThread) return
    if (onSend(body)) setInputText("")
  }

  const handleSendPressIn = () => {
    sendScaleAnim.stopAnimation()
    if (reduceMotion) {
      sendScaleAnim.setValue(1)
      return
    }
    Animated.spring(sendScaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleSendPressOut = () => {
    sendScaleAnim.stopAnimation()
    if (reduceMotion) {
      sendScaleAnim.setValue(1)
      return
    }
    Animated.spring(sendScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
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
          <Ionicons name="home-outline" size={20} color={uiTheme.colors.primaryDeep} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel={chatCopy.messageAccessibilityLabel(partnerName)}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={chatCopy.messagePlaceholder}
            placeholderTextColor={uiTheme.colors.textMuted}
            multiline
            maxLength={500}
          />
        </View>
        <Animated.View style={{ transform: [{ scale: sendScaleAnim }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatCopy.sendAccessibilityLabel(partnerName)}
            accessibilityState={{ disabled: isSendDisabled }}
            onPress={handleSend}
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
