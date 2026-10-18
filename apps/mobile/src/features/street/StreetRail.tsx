import type { StreetWindow } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { useAvatarV2 } from "../avatarV2/state/AvatarV2Provider"
import { writeChatComposerDraft } from "../chat/chatComposerDraftStore"
import type { SessionActor } from "../session/sessionModel"
import { hapticLight } from "../../ui/haptics"
import { useReducedMotion } from "../../ui/motion"
import { uiTheme } from "../../ui/theme"
import { getStreetCopy } from "./streetCopy"
import { buildStreetView, previousStreetSnapshot, shouldPlayStreetWakeUp, type StreetSlot } from "./streetModel"
import { StreetRoomPeek } from "./StreetRoomPeek"
import { STREET_WINDOW, StreetWindowView, type StreetWindowKind } from "./StreetWindow"
import { useStreet } from "./useStreet"

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
  const { street, device, markOpened, markInfoSeen, markWoke } = useStreet({
    sessionActor,
    enabled: resolvedCapabilities.chat_street === true,
    refreshKey: props.refreshKey
  })
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
      />
    )
  }, [copy, markOpened, onOpenChat, props, sessionActor.profile.avatar, street, wakeUp])

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
      />
    </View>
  )
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
