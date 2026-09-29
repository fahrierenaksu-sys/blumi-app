import { memo } from "react"
import { Pressable, Text, View } from "react-native"
import { Avatar } from "../../ui/avatar"
import { settingsStyles as styles } from "./settingsStyles"

export const BlockedUserRow = memo(function BlockedUserRow(props: {
  isLast: boolean
  onUnblock: (userId: string) => void
  userId: string
  profile?: { displayName: string; avatarPresetId?: string }
}) {
  const { isLast, onUnblock, profile, userId } = props

  return (
    <View
      style={[
        styles.blockedCard,
        !isLast ? styles.rowDivider : null
      ]}
    >
      <Avatar
        name={profile?.displayName ?? "?"}
        seed={profile?.avatarPresetId ?? userId}
        size={40}
        ring="soft"
      />
      <View style={styles.blockedBody}>
        <Text style={styles.blockedId} numberOfLines={1}>
          {profile?.displayName ?? "Hidden profile"}
        </Text>
        <Text style={styles.blockedLabel}>Hidden from you</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show blocked user ${userId.slice(0, 12)}`}
        onPress={() => onUnblock(userId)}
        style={({ pressed }) => [
          styles.unblockButton,
          pressed ? { opacity: 0.85 } : null
        ]}
      >
        <Text style={styles.unblockText}>Show</Text>
      </Pressable>
    </View>
  )
}, (previous, next) =>
  previous.isLast === next.isLast &&
  previous.onUnblock === next.onUnblock &&
  previous.userId === next.userId &&
  previous.profile?.displayName === next.profile?.displayName &&
  previous.profile?.avatarPresetId === next.profile?.avatarPresetId
)
