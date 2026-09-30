import * as Sentry from "@sentry/react-native"
import { useCallback, useState } from "react"
import { Alert } from "react-native"
import type { CapabilityMap } from "@blumi/contracts"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import { updateRoomShowcaseVisibility } from "../discovery/roomShowcaseApi"
import type { SessionActor } from "../session/sessionApi"

/**
 * The My Room "show my room on my card" control: capability gate, the
 * public/hidden prompt and the server update. Moved out of MyRoomScreen
 * unchanged so the screen stays under its size cap.
 */
export function useMyRoomShowcase(input: {
  sessionActor: SessionActor
  resolvedCapabilities?: CapabilityMap
  tryAgainCopy: string
}): { roomShowcasePublic: boolean; openRoomShowcase: () => void } {
  const { sessionActor, resolvedCapabilities, tryAgainCopy } = input
  const [roomShowcasePublic, setRoomShowcasePublic] = useState(false)
  const roomShowcaseEnabled = sessionActor.session.mode === "production" &&
    resolvedCapabilities?.discovery_room_showcase === true

  const setRoomShowcase = useCallback(async (
    isPublic: boolean,
    headline: string | null
  ): Promise<void> => {
    try {
      const result = await updateRoomShowcaseVisibility(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { isPublic, headline }
      )
      setRoomShowcasePublic(result.isPublic)
      showToast({
        title: result.isPublic ? "Kart vitrini güncellendi" : "Oda karttan kaldırıldı",
        body: result.isPublic
          ? "Son kaydettiğin oda, kartının arkasında gösterilecek."
          : "Odan artık Discovery kartlarında görünmeyecek.",
        type: "success"
      })
    } catch (error) {
      Sentry.captureException(error, { tags: { feature: "room_showcase" } })
      showToast({
        title: "Kart vitrini kullanılamıyor",
        body: error instanceof Error ? error.message : tryAgainCopy,
        type: "warning"
      })
    }
  }, [tryAgainCopy, sessionActor])

  const openRoomShowcase = useCallback((): void => {
    if (!roomShowcaseEnabled) {
      showToast({
        title: "Kart vitrini henüz açık değil",
        body: "Bu özellik kademeli olarak açılıyor.",
        type: "info"
      })
      return
    }
    if (roomShowcasePublic) {
      Alert.alert(
        "Oda vitrini",
        "Son kaydettiğin oda Discovery kartının arkasında gösteriliyor.",
        [
          { text: "Kapat", style: "cancel" },
          {
            text: "Karttan kaldır",
            style: "destructive",
            onPress: () => { void setRoomShowcase(false, null) }
          }
        ]
      )
      return
    }
    Alert.prompt(
      "Oda vitrini",
      "Kartının yanında görünecek kısa başlık (isteğe bağlı, en fazla 30 karakter).",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kartında göster",
          onPress: (value?: string) => {
            const headline = value?.trim() || null
            void setRoomShowcase(true, headline)
          }
        }
      ],
      "plain-text",
      ""
    )
  }, [roomShowcaseEnabled, roomShowcasePublic, setRoomShowcase])

  return { roomShowcasePublic, openRoomShowcase }
}
