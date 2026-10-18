import type { StreetWindow } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { useAvatarV2 } from "../avatarV2/state/AvatarV2Provider"
import { writeChatComposerDraft } from "../chat/chatComposerDraftStore"
import { useChatInboxStore } from "../chat/chatStore"
import type { SessionActor } from "../session/sessionModel"
import { hapticLight } from "../../ui/haptics"
import { useReducedMotion } from "../../ui/motion"
import { uiTheme } from "../../ui/theme"
import { getStreetCopy } from "./streetCopy"
import { buildStreetView, previousStreetSnapshot, shouldPlayStreetWakeUp, type StreetSlot } from "./streetModel"
import { StreetNoteComposer } from "./StreetNoteComposer"
import { IS_STREET_NOTES_DEMO_ENABLED, buildStreetNotesDemo, isStreetDemoThread } from "./streetNotesDemo"
import { StreetRoomPeek } from "./StreetRoomPeek"
import { STREET_WINDOW, StreetWindowView, type StreetWindowKind } from "./StreetWindow"
import { useStreet } from "./useStreet"
import { useStreetLight } from "./useStreetLight"

const SIDE_PADDING = 20

/**
 * Sokağım in the Chats tab (spec §3). Renders nothing unless the `chat_street` capability is on for this session and
 * the server answers, so with the flag off the Chats tab is exactly as before.
 */
export function StreetRail(props: {
  sessionActor: SessionActor
  locale: "tr" | "en"
  refreshKey: string
  fallbackName: string
  onOpenChat: (threadId: string) => void
  onOpenOwnRoom: () => void
  onOpenSettings: () => void
  /** The "find neighbours" slot opens Discover. */
  onOpenDiscover: () => void
}) {
  const { sessionActor, onOpenChat } = props
  const { resolvedCapabilities } = useAvatarV2()
  const copy = useMemo(() => getStreetCopy(props.locale), [props.locale])
  const reduceMotion = useReducedMotion()
  const { street: serverStreet, device, markOpened, markInfoSeen, markWoke } = useStreet({
    sessionActor,
    enabled: resolvedCapabilities.chat_street === true,
    refreshKey: props.refreshKey
  })
  const demo = useStreetNotesDemo(sessionActor.profile.userId, serverStreet)
  const street = demo?.street ?? serverStreet
  const notes = demo?.notes ?? NO_NOTES
  const light = useStreetLight()
  // Notes prototype: your own note lives on this device only until the server keeps notes.
  const [myNote, setMyNote] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const notesOn = IS_STREET_NOTES_DEMO_ENABLED
  const [peek, setPeek] = useState<StreetWindow | null>(null)
  const seen = useMemo(() => new Set(device.seenThreadIds), [device.seenThreadIds])
  const view = useMemo(() => street ? buildStreetView(street, copy, seen) : null, [copy, seen, street])
  const wakeUp = street ? shouldPlayStreetWakeUp(device, street.edition, reduceMotion) : false
  useEffect(() => {
    if (street && wakeUp) markWoke(street.edition)
  }, [markWoke, street, wakeUp])

  const openChatWithDraft = useCallback((threadId: string, draft: string | null) => {
    if (draft) writeChatComposerDraft(sessionActor.profile.userId, threadId, draft)
    setPeek(null)
    onOpenChat(threadId)
  }, [onOpenChat, sessionActor.profile.userId])

  const replyToNote = useCallback((threadId: string, note: string, reply: string) => {
    if (isStreetDemoThread(threadId)) {
      setPeek(null)
      Alert.alert(copy.demoReplyTitle, copy.demoReplyBody)
      return
    }
    openChatWithDraft(threadId, `“${note}” ${reply}`)
  }, [copy, openChatWithDraft])

  const renderSlot = useCallback(({ item, index }: { item: StreetSlot; index: number }) => {
    const kind: StreetWindowKind = item.kind === "self"
      ? { kind: "self", closed: item.closed, room: item.room, avatar: sessionActor.profile.avatar ?? null }
      : item.kind === "window" ? { kind: "window", window: item.window, isNew: item.isNew } : { kind: "empty" }
    const onPress = () => {
      hapticLight()
      if (item.kind === "self") return props.onOpenOwnRoom()
      if (item.kind === "empty") return props.onOpenDiscover()
      if (item.window.closed) return onOpenChat(item.window.threadId)
      if (street) markOpened(item.window, street.edition)
      setPeek(item.window)
    }
    return (
      <StreetWindowView
        item={kind}
        index={index}
        copy={copy}
        fallbackName={props.fallbackName}
        wakeUp={wakeUp}
        onPress={onPress}
        onOpenChat={item.kind === "window" ? () => onOpenChat(item.window.threadId) : undefined}
        note={item.kind === "self" ? myNote : item.kind === "window" ? notes[item.window.threadId] ?? null : null}
        light={notesOn ? light : undefined}
        onEditNote={item.kind === "self" && notesOn ? () => setComposerOpen(true) : undefined}
      />
    )
  }, [copy, light, markOpened, myNote, notes, notesOn, onOpenChat, props, sessionActor.profile.avatar, street, wakeUp])

  if (!view || !street) return null
  return (
    <View style={styles.root}>
      {device.infoCardSeen ? null : (
        <View style={styles.info} accessibilityRole="summary">
          <Text style={styles.infoTitle}>{copy.infoTitle}</Text>
          <Text style={styles.infoBody}>{copy.infoBody}</Text>
          <View style={styles.infoActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.infoSettings} onPress={() => { markInfoSeen(); props.onOpenSettings() }}>
              <Text style={styles.infoLink}>{copy.infoSettings}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.infoOk} onPress={markInfoSeen}>
              <Text style={styles.infoLink}>{copy.infoOk}</Text>
            </Pressable>
          </View>
        </View>
      )}
      <FlatList
        horizontal
        data={view.slots}
        keyExtractor={(slot) => slot.key}
        renderItem={renderSlot}
        accessibilityRole="list"
        accessibilityLabel={view.railLabel}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        windowSize={3}
        initialNumToRender={5}
        contentContainerStyle={styles.rail}
        ItemSeparatorComponent={RailGap}
      />
      <StreetRoomPeek
        window={peek}
        previous={peek ? previousStreetSnapshot(device, peek, street.edition) : null}
        copy={copy}
        fallbackName={props.fallbackName}
        onClose={() => setPeek(null)}
        onStarter={openChatWithDraft}
        note={peek ? notes[peek.threadId] ?? null : null}
        onReply={replyToNote}
      />
      <StreetNoteComposer
        visible={composerOpen}
        current={myNote}
        copy={copy}
        onSave={(note) => { setMyNote(note); setComposerOpen(false) }}
        onClose={() => setComposerOpen(false)}
      />
    </View>
  )
}

const NO_NOTES: Readonly<Record<string, string>> = Object.freeze({})

/** Dev builds with EXPO_PUBLIC_BLUMI_STREET_NOTES_DEMO=1 only: made-up neighbours wearing your chat partners' looks. */
function useStreetNotesDemo(userId: string, serverStreet: ReturnType<typeof useStreet>["street"]) {
  const { threads } = useChatInboxStore()
  const partnerAvatars = useMemo(() => threads
    .map((thread) => thread.participants.find((participant) => participant.userId !== userId)?.avatar ?? null)
    .filter((avatar) => avatar !== null), [threads, userId])
  return useMemo(() => IS_STREET_NOTES_DEMO_ENABLED
    ? buildStreetNotesDemo({
      edition: serverStreet?.edition ?? new Date().toISOString().slice(0, 10),
      self: serverStreet?.self ?? null,
      partnerAvatars
    })
    : null, [partnerAvatars, serverStreet])
}

function RailGap() {
  return <View style={{ width: STREET_WINDOW.gap }} />
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -SIDE_PADDING, paddingBottom: 2 },
  rail: { paddingHorizontal: SIDE_PADDING, paddingTop: 0, paddingBottom: 2 },
  info: { marginHorizontal: SIDE_PADDING, marginBottom: 8, padding: 12, borderRadius: 16, backgroundColor: uiTheme.colors.surfaceSoft, gap: 4 },
  infoTitle: { color: uiTheme.colors.textPrimary, fontWeight: "700" },
  infoBody: { color: uiTheme.colors.textSecondary, fontSize: 13 },
  infoActions: { flexDirection: "row", justifyContent: "flex-end", gap: 18, marginTop: 4 },
  infoLink: { color: uiTheme.colors.primaryDeep, fontWeight: "700" }
})
