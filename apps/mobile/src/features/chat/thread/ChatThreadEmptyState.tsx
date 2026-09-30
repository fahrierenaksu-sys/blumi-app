import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { Pressable, Text, View } from "react-native"
import { ParticipantAvatar } from "../../../ui/participantAvatar"
import { uiTheme } from "../../../ui/theme"
import type { MessageListState } from "../chatStore"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"

/**
 * Shown instead of the timeline while a matched chat is being created, while
 * the first history page loads, when history failed, or when it is empty.
 */
export function ChatThreadEmptyState({
  chatCopy,
  isPendingThread,
  pendingThreadCreationFailed,
  isCreatingPendingThread,
  onRetryOpenChat,
  messageListState,
  onRetryMessages,
  partnerName,
  partnerUserId,
  partnerAvatar
}: {
  chatCopy: ChatThreadCopy
  isPendingThread: boolean
  pendingThreadCreationFailed: boolean
  isCreatingPendingThread: boolean
  onRetryOpenChat: () => void
  messageListState: MessageListState
  onRetryMessages: () => void
  partnerName: string
  partnerUserId: string
  partnerAvatar: AvatarSelection | undefined
}) {
  return (
    <View style={styles.emptyChat}>
      <View style={styles.emptyChatGlow} pointerEvents="none" />
      {isPendingThread && pendingThreadCreationFailed ? (
        <View accessibilityRole="alert" style={styles.messageLoadState}>
          <Ionicons
            name="cloud-offline-outline"
            size={34}
            color={uiTheme.colors.primaryDeep}
          />
          <Text style={styles.emptyChatTitle}>{chatCopy.pendingCreationFailed}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatCopy.retryOpenChat}
            accessibilityState={{ disabled: isCreatingPendingThread }}
            onPress={onRetryOpenChat}
            disabled={isCreatingPendingThread}
            style={({ pressed }) => [
              styles.retryMessagesButton,
              pressed ? styles.retryMessagesButtonPressed : null,
              isCreatingPendingThread ? styles.retryMessagesButtonDisabled : null
            ]}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={uiTheme.colors.primaryDeep}
            />
            <Text style={styles.retryMessagesText}>
              {isCreatingPendingThread ? chatCopy.openingChat : chatCopy.retryOpenChat}
            </Text>
          </Pressable>
        </View>
      ) : messageListState.status === "failed" && !isPendingThread ? (
        <View accessibilityRole="alert" style={styles.messageLoadState}>
          <Ionicons
            name="cloud-offline-outline"
            size={34}
            color={uiTheme.colors.primaryDeep}
          />
          <Text style={styles.emptyChatTitle}>{chatCopy.loadFailed}</Text>
          <Text style={styles.emptyChatBody}>
            {messageListState.errorMessage}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatCopy.retryLoading}
            onPress={onRetryMessages}
            style={({ pressed }) => [
              styles.retryMessagesButton,
              pressed ? styles.retryMessagesButtonPressed : null
            ]}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={uiTheme.colors.primaryDeep}
            />
            <Text style={styles.retryMessagesText}>
              {chatCopy.retryLoading}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ParticipantAvatar
            name={partnerName}
            seed={partnerUserId || partnerName}
            avatar={partnerAvatar}
            size={80}
            ring="soft"
          />
          <Text style={styles.emptyChatTitle}>
            {isPendingThread || messageListState.status !== "ready"
              ? chatCopy.openingChat
              : chatCopy.startSpark}
          </Text>
          <Text style={styles.emptyChatBody}>
            {isPendingThread || messageListState.status !== "ready"
              ? chatCopy.gettingReady
              : chatCopy.startSparkDetail}
          </Text>
        </>
      )}
    </View>
  )
}
