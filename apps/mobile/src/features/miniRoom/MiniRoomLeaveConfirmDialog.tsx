import { Modal, StyleSheet, Text, View } from "react-native"
import { CardWrapper, PrimaryButton, SecondaryButton } from "../../ui/primitives"
import { uiTheme } from "../../ui/theme"
import type { MiniRoomLeavePromptView } from "./useMiniRoomLeaveGuard"

/** The "leave the room?" question, drawn by the room screen so it closes with it. */
export function MiniRoomLeaveConfirmDialog({ prompt }: { prompt: MiniRoomLeavePromptView }) {
  const { confirmation } = prompt
  const [stay, leave] = confirmation.buttons
  return (
    <Modal
      visible={prompt.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={prompt.onStay}
    >
      <View style={styles.backdrop}>
        <CardWrapper variant="elevated" style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{confirmation.title}</Text>
          <Text style={styles.message}>{confirmation.message}</Text>
          <View style={styles.actions}>
            <SecondaryButton label={stay.text} onPress={prompt.onStay} />
            <PrimaryButton label={leave.text} onPress={prompt.onLeave} />
          </View>
        </CardWrapper>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: uiTheme.colors.overlayDark
  },
  card: {
    gap: 12
  },
  title: {
    color: uiTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center"
  },
  message: {
    color: uiTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  actions: {
    gap: 10,
    marginTop: 4
  }
})
