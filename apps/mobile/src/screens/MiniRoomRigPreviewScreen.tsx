import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ProfilerOnRenderCallback } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { InRoomChatMessageEvent } from "../features/miniRoom/useInRoomChat"
import type { RoomChatHistoryItem } from "../features/miniRoom/roomChatHistoryModel"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { createCurrentUserAvatarSnapshot } from "../features/miniRoom/currentUserAvatarSnapshot"
import { createMiniRoomPartnerAvatarSnapshot } from "../features/miniRoom/partnerAvatarSnapshot"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import { MiniRoomScene } from "../features/miniRoom/scene/MiniRoomScene"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"

type MiniRoomRigPreviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MiniRoomRigPreview"
> & {
  sessionActor: SessionActor
}

const PARTNER = {
  userId: "mini-room-rig-preview-partner",
  displayName: "Defne"
} as const

const LOCAL_MEDIA_OFF = {
  micEnabled: false,
  speakerEnabled: false
} as const
const NOOP = () => undefined
const QA_SHORT = ["Deneme bir", "Deneme iki", "Deneme üç"]
const QA_LONG = "Bu yalnızca yerel bir deneme mesajıdır. Uzun metnin balon içinde okunmasını ve üst üste gelen mesajların kaybolmasını kontrol ediyoruz."

export function MiniRoomRigPreviewScreen(props: MiniRoomRigPreviewScreenProps) {
  const { navigation, sessionActor } = props
  const { avatar, catalog } = useAvatarV2()
  const { userRoomDecor } = useRoomV2()
  const [inRoomMessages, setInRoomMessages] = useState<InRoomChatMessageEvent[]>([])
  const [qaExpanded, setQaExpanded] = useState(false)
  const [qaSummary, setQaSummary] = useState("Sentetik QA")
  const counter = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const samples = useRef<{ durationMs: number; phase: string }[]>([])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])
  const recordRender = useCallback<ProfilerOnRenderCallback>((_id, phase, actualDuration) => {
    if (samples.current.length < 500) samples.current.push({ durationMs: actualDuration, phase })
  }, [])
  // Local-only UI examples for the existing development-only route. Never sent or persisted.
  const [chatHistory, setChatHistory] = useState<RoomChatHistoryItem[]>([
    { id: "preview-recent", body: "Biraz yoğun. Şimdi dinleniyorum. Burada sakin sakin sohbet etmek iyi geldi.", mine: false, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:26:00Z" },
    { id: "preview-outgoing", body: "Ben de öyle düşünüyorum. Günün nasıl geçti?", mine: true, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:25:00Z" },
    { id: "preview-earlier", body: "Burada olmak güzel.", mine: false, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:24:00Z" }
  ])
  const localUser = useMemo(() => ({
    userId: sessionActor.profile.userId,
    displayName: getMiniRoomCopy("tr").youLabel
  }), [sessionActor.profile.userId])
  const participantAvatarSnapshots = useMemo(() => ({
    local: createCurrentUserAvatarSnapshot({
      ...localUser,
      avatar,
      avatarCatalog: catalog
    }),
    partner: createMiniRoomPartnerAvatarSnapshot(PARTNER)
  }), [avatar, catalog, localUser])
  const roomDecorScene = useMemo(() => resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: userRoomDecor,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }), [userRoomDecor])
  const consumeInRoomMessage = useCallback((messageId: string) => {
    setInRoomMessages((current) => current.filter((message) => message.messageId !== messageId))
  }, [])
  const onSendRoomMessage = useCallback((body: string) => {
    const id = `preview-local-${++counter.current}`
    setChatHistory((current) => [{ id, body, mine: true, delivery: "sent" as const, showMeta: true,
      sentAt: new Date().toISOString() }, ...current].slice(0, 15))
    return true
  }, [])
  const runBurst = useCallback((concurrent: boolean, long: boolean) => {
    samples.current = []
    timers.current.forEach(clearTimeout)
    timers.current = QA_SHORT.map((body, index) => setTimeout(() => {
      const now = Date.now()
      const event = (senderUserId: string): InRoomChatMessageEvent => ({
        messageId: `preview-burst-${++counter.current}`, senderUserId,
        body: long ? QA_LONG : body, sentAt: now
      })
      const messages = [event(localUser.userId), ...(concurrent ? [event(PARTNER.userId)] : [])]
      setChatHistory((current) => [...messages.map((message) => ({ id: message.messageId,
        body: message.body, mine: message.senderUserId === localUser.userId, delivery: "sent" as const,
        showMeta: true, sentAt: new Date(message.sentAt).toISOString() })), ...current].slice(0, 15))
      setInRoomMessages((current) => [...current, ...messages])
    }, index * 350))
    setQaExpanded(false)
    setQaSummary(concurrent ? "Sentetik QA · 3+3" : "Sentetik QA · 3")
  }, [localUser.userId])
  const summarize = useCallback(() => {
    const durations = samples.current.filter((sample) => sample.phase !== "mount").map((sample) => sample.durationMs)
    const total = durations.reduce((sum, duration) => sum + duration, 0)
    const summary = { commits: durations.length, totalRenderMs: Number(total.toFixed(2)),
      maxRenderMs: Number(Math.max(0, ...durations).toFixed(2)) }
    // Numeric, bounded QA evidence only: no message bodies or participant identity.
    console.info("MINIROOM_SYNTHETIC_QA", JSON.stringify(summary))
    setQaSummary(`QA · ${summary.commits} çizim · ${summary.totalRenderMs} ms · max ${summary.maxRenderMs}`)
  }, [])

  return (
    <View style={qaStyles.root}>
    <Profiler id="MiniRoomSyntheticQA" onRender={recordRender}>
    <MiniRoomScene
      copy={getMiniRoomCopy("tr")}
      localUser={localUser}
      partnerUser={PARTNER}
      participantAvatarSnapshots={participantAvatarSnapshots}
      connectionStatus="connected"
      voiceAvailable={false}
      localMedia={LOCAL_MEDIA_OFF}
      roomDecorScene={roomDecorScene}
      leaveDisabled={false}
      onLeave={() => goBackOrFallback(navigation, () => navigation.replace("MyRoom"))}
      onOpenSafety={NOOP}
      onRetryConnect={NOOP}
      onToggleMic={NOOP}
      inRoomMessages={inRoomMessages}
      consumeInRoomMessage={consumeInRoomMessage}
      canChatSend={true}
      onSendRoomMessage={onSendRoomMessage}
      chatHistory={chatHistory}
      chatHistoryStatus="ready"
    />
    </Profiler>
    <View style={qaStyles.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel="Sentetik QA araçları" onPress={() => setQaExpanded((value) => !value)}>
        <Text style={qaStyles.label}>{qaSummary}</Text>
      </Pressable>
      {qaExpanded && <>
        <Pressable accessibilityRole="button" accessibilityLabel="Üç hızlı sentetik mesaj" onPress={() => runBurst(false, false)}><Text style={qaStyles.label}>3 mesaj</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="İki kişiden üçer sentetik mesaj" onPress={() => runBurst(true, false)}><Text style={qaStyles.label}>3+3 mesaj</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Uzun sentetik mesajlar" onPress={() => runBurst(true, true)}><Text style={qaStyles.label}>Uzun 3+3</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="QA çizim ölçümünü sıfırla" onPress={() => { samples.current = []; setQaExpanded(false); setQaSummary("Sentetik QA · ölçüm") }}><Text style={qaStyles.label}>Ölçümü sıfırla</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="QA çizim ölçümünü göster" onPress={summarize}><Text style={qaStyles.label}>Ölçümü göster</Text></Pressable>
      </>}
    </View>
    </View>
  )
}

const qaStyles = StyleSheet.create({
  root: { flex: 1 },
  tools: { position: "absolute", right: 12, top: 114, padding: 5, backgroundColor: "#FFF7FA", borderRadius: 8 },
  label: { color: "#806780", fontSize: 10, padding: 3 }
})
