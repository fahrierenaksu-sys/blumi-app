import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { Pressable, Text, View } from "react-native"
import { ParticipantAvatar } from "../../../ui/participantAvatar"
import { ActionButtonCircle } from "../../../ui/primitives"
import { uiTheme } from "../../../ui/theme"
import type { ChatLocale } from "../chatRoomInviteModel"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"
import { PressableScale } from "../../../ui/PressableScale"

/**
 * Static conversation header: back, partner avatar and name, the optional
 * persisted-match replay link, and the safety menu entry. The avatar (and
 * the name beside it) opens the partner's profile when one can be shown.
 */
export function ChatThreadHeader({
  chatCopy,
  chatLocale,
  partnerName,
  partnerUserId,
  partnerAvatar,
  onBack,
  onViewMatch,
  onOpenSafety,
  onOpenProfile,
  onWarmProfile
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
  /** Null while the partner is not known yet (no profile to open). */
  onOpenProfile: (() => void) | null
  /** Starts loading the profile as the finger lands, so it opens on loaded data. */
  onWarmProfile?: () => void
}) {
  return (
    <View style={styles.chatHeader}>
      <ActionButtonCircle accessibilityLabel={chatCopy.back} onPress={onBack} size={40}>
        <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
      </ActionButtonCircle>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chatCopy.openProfileAccessibilityLabel(partnerName)}
        accessibilityHint={chatCopy.openProfileHint}
        accessibilityState={{ disabled: !onOpenProfile }}
        disabled={!onOpenProfile}
        onPress={onOpenProfile ?? undefined}
        onPressIn={onOpenProfile ? onWarmProfile : undefined}
        hitSlop={4}
        style={({ pressed }) => [styles.chatHeaderAvatarButton, pressed ? styles.chatHeaderPressed : null]}
      >
        <ParticipantAvatar
          name={partnerName}
          seed={partnerUserId || partnerName}
          avatar={partnerAvatar}
          size={44}
          ring="soft"
        />
      </Pressable>
      <View style={styles.chatHeaderCopy}>
        {/* A larger touch target for the same action; VoiceOver uses the avatar button. */}
        <Text
          accessible={false}
          numberOfLines={1}
          onPress={onOpenProfile ?? undefined}
          onPressIn={onOpenProfile ? onWarmProfile : undefined}
          style={styles.chatHeaderName}
        >
          {partnerName}
        </Text>
        {onViewMatch ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={chatLocale === "tr" ? "Eşleşmeyi gör" : "View match"}
            hitSlop={8}
            onPress={onViewMatch}
          >
            <Text style={styles.matchReplayText}>
              {chatLocale === "tr" ? "Eşleşmeyi gör" : "View match"}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={chatCopy.safetyAccessibilityLabel(partnerName)}
        onPress={onOpenSafety}
        hitSlop={8}
        style={styles.moreButton}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={uiTheme.colors.textSecondary} />
      </PressableScale>
    </View>
  )
}
