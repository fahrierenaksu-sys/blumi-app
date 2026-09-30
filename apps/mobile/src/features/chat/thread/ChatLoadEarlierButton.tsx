import { Pressable, Text } from "react-native"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { styles } from "./chatThreadStyles"

/**
 * Footer of the inverted list, so earlier history is appended at the far end
 * and the visible messages keep their position.
 */
export function ChatLoadEarlierButton({
  chatCopy,
  isLoadingEarlier,
  onPress
}: {
  chatCopy: ChatThreadCopy
  isLoadingEarlier: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chatCopy.loadEarlier}
      accessibilityState={{ disabled: isLoadingEarlier }}
      onPress={onPress}
      disabled={isLoadingEarlier}
      style={({ pressed }) => [
        styles.loadEarlierButton,
        pressed ? styles.loadEarlierButtonPressed : null,
        isLoadingEarlier ? styles.loadEarlierButtonDisabled : null
      ]}
    >
      <Text style={styles.loadEarlierText}>
        {isLoadingEarlier ? chatCopy.loading : chatCopy.loadEarlier}
      </Text>
    </Pressable>
  )
}
