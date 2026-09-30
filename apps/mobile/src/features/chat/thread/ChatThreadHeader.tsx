import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { Pressable, Text, View } from "react-native"
import { ParticipantAvatar } from "../../../ui/participantAvatar"
import { ActionButtonCircle } from "../../../ui/primitives"
import { uiTheme } from "../../../ui/theme"
import type { ChatLocale } from "../chatRoomInviteModel"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"

/**
 * Static conversation header: back, partner avatar and name, the optional
 * persisted-match replay link, and the safety menu entry.
 */
export function ChatThreadHeader({
  chatCopy,
  chatLocale,
  partnerName,
  partnerUserId,
  partnerAvatar,
  onBack,
  onViewMatch,
  onOpenSafety
}: {
  chatCopy: ChatThreadCopy
  chatLocale: ChatLocale
  partnerName: string
  partnerUserId: string
  partnerAvatar: AvatarSelection | undefined
  onBack: () => void
  /** Null when this conversation has no persisted match to replay. */
  onViewMatch: (() => void) | null
  onOpenSafety: () => void
}) {
  return (
    <View style={styles.chatHeader}>
      <ActionButtonCircle accessibilityLabel={chatCopy.back} onPress={onBack} size={40}>
        <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
      </ActionButtonCircle>
      <ParticipantAvatar
        name={partnerName}
        seed={partnerUserId || partnerName}
        avatar={partnerAvatar}
        size={44}
        ring="soft"
      />
      <View style={styles.chatHeaderCopy}>
        <Text numberOfLines={1} style={styles.chatHeaderName}>{partnerName}</Text>
        {onViewMatch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatLocale === "tr" ? "Eşleşmeyi gör" : "View match"}
            hitSlop={8}
            onPress={onViewMatch}
          >
            <Text style={styles.matchReplayText}>
              {chatLocale === "tr" ? "Eşleşmeyi gör" : "View match"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chatCopy.safetyAccessibilityLabel(partnerName)}
        onPress={onOpenSafety}
        hitSlop={8}
        style={styles.moreButton}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={uiTheme.colors.textSecondary} />
      </Pressable>
    </View>
  )
}
