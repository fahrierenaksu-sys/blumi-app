import { useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import { PrimaryButton, SecondaryButton } from "../../ui/primitives"
import { uiTheme } from "../../ui/theme"
import { useChatNotificationPrompt } from "./useChatNotificationPrompt"
import type { usePushRegistration } from "./usePushRegistration"

export type ChatPushRegistration = ReturnType<typeof usePushRegistration>
const COPY = {
  tr: { title: "Yeni mesajları kaçırma", body: "Sohbet bildirimlerini aç. Mesajlarının içeriği bildirimlerde görünmez.",
    enable: "Bildirimleri aç", later: "Şimdi değil", error: "Bağlantını kontrol edip tekrar dene." },
  en: { title: "Keep up with your chats", body: "Turn on chat notifications. Your message content stays private.",
    enable: "Enable notifications", later: "Not now", error: "Check your connection and try again." }
}

export function ChatNotificationPermissionCard(props: {
  userId: string
  mode: "demo" | "production"
  isFocused: boolean
  locale: "tr" | "en"
  registration: ChatPushRegistration
}) {
  const { registration } = props
  const prompt = useChatNotificationPrompt({ ...props, permissionStatus: registration.permissionStatus })
  const [failed, setFailed] = useState(false)
  if (!prompt.visible) return null
  const copy = COPY[props.locale]
  return (
    <View style={styles.card} testID="chat-notification-permission-card">
      <View style={styles.intro}>
        <Image accessibilityIgnoresInvertColors accessible={false}
          source={require("../session/assets/register-world-hero-v1-runtime/blumi_register_world_hero_v1.png")}
          style={styles.illustration} resizeMode="contain" />
        <View style={styles.text}>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
        </View>
      </View>
      {failed && <Text accessibilityRole="alert" style={styles.body}>{copy.error}</Text>}
      <PrimaryButton label={copy.enable} busy={registration.isRequestingPermission}
        onPress={() => {
          setFailed(false)
          void registration.requestPermission().then(prompt.dismiss).catch(() => setFailed(true))
        }} />
      <SecondaryButton label={copy.later} disabled={registration.isRequestingPermission} onPress={prompt.dismiss} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: 20,
    backgroundColor: uiTheme.colors.surface, gap: 8 },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
  illustration: { width: 64, height: 64 },
  text: { flex: 1, gap: 4 },
  title: { color: uiTheme.colors.textPrimary, fontSize: 16, fontWeight: "600" },
  body: { color: uiTheme.colors.textMuted, fontSize: 14, lineHeight: 20 }
})
