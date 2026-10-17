import type { LayoutChangeEvent } from "react-native"
import {
  Keyboard,
  StyleSheet,
  View,
  useWindowDimensions
} from "react-native"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Reanimated from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { FailedRoomMessage, InRoomChatMessageEvent } from "../useInRoomChat"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import { useReducedMotion } from "../../../ui/animations"
import { hapticSoft } from "../../../ui/haptics"
import { RoomFloorTapLayer } from "../../roomV2/components/RoomFloorTapLayer"
import { useMyRoomStageCover, useStageRevealStyle } from "../../roomV2/components/MyRoomStageVeil"
import { AvatarLayer } from "./AvatarLayer"
import { HotspotLayer } from "./HotspotLayer"
import { MiniRoomChatPanel } from "./MiniRoomChatPanel"
import { MiniRoomContext } from "./MiniRoomContext"
import { MiniRoomHud } from "./MiniRoomHud"
import { MiniRoomRoomDecorLayer } from "./MiniRoomRoomDecorLayer"
import { RoomChatComposer } from "./RoomChatComposer"
import { useMiniRoomSceneStore } from "./miniRoomSceneStore"
import { createMiniRoomDepthScene } from "./miniRoomDepthModel"
import {
  MINI_ROOM_PARTNER_ARRIVAL_MS,
  resolveMiniRoomMotionPolicy
} from "./miniRoomReducedMotion"
import type { MiniRoomParticipantAvatarSnapshots } from "./miniRoomSceneTypes"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { shouldAnnouncePartnerJoin } from "./miniRoomPresentation"
import {
  resolveComposerLineCount,
  resolveMiniRoomLayout,
  resolveMiniRoomRestCamera
} from "./miniRoomLayout"
import { useMiniRoomKeyboard } from "./useMiniRoomKeyboard"
import { useMiniRoomCameraTransform } from "./useMiniRoomCameraTransform"
import { useMiniRoomMotionPresentation } from "./useMiniRoomMotionPresentation"
import { useMiniRoomScrollToLatest } from "./useMiniRoomScrollToLatest"
import { useMiniRoomKeyboardPreference } from "../useMiniRoomKeyboardPreference"
import type { MiniRoomPoseInput } from "./miniRoomTransitionModel"
import { MINI_ROOM_EMOTE_LIFETIME_MS, useMiniRoomChatEmotes } from "../emotes/useMiniRoomChatEmotes"
import type { ChatEmote } from "../emotes/chatEmoteMapper"

interface MiniRoomSceneProps {
  roomMotion?: ReturnType<typeof import("../useMiniRoomMotion").useMiniRoomMotion>
  copy: MiniRoomCopy
  localUser: {
    userId: string
    displayName: string
  }
  partnerUser: {
    userId: string
    displayName: string
  }
  participantAvatarSnapshots: MiniRoomParticipantAvatarSnapshots
  connectionStatus: MiniRoomConnectionStatus
  voiceAvailable: boolean
  localMedia: MiniRoomLocalMediaState
  /** Without a shell nothing is drawn or walkable: the retired pink bedroom is no fallback. */
  roomDecorScene: ResolvedRoomV2Scene
  leaveDisabled: boolean
  onLeave: () => void
  onOpenSafety: () => void
  onRetryConnect: () => void
  onToggleMic: () => void
  inRoomMessages: InRoomChatMessageEvent[]
  consumeInRoomMessage: (messageId: string) => void
  consumeInRoomMessages?: (messageIds: readonly string[]) => void
  canChatSend: boolean
  onSendRoomMessage: (body: string, retryClientMessageId?: string) => boolean
  /** Oldest unresolved room message (useInRoomChat), used by the notice. */
  failedRoomMessage?: FailedRoomMessage | null
  failedRoomMessages?: readonly FailedRoomMessage[]
  /** Durable room conversation, newest first (useRoomChatHistory). */
  chatHistory?: readonly RoomChatHistoryItem[]
  chatHistoryStatus?: RoomChatHistoryStatus
  /** Screen-level alerts shown under the header. */
  notices?: readonly string[]
  /** Typing (chat_typing): dots over the partner and this device's draft signal. */
  typing?: { partnerTyping: boolean; draft: import("../../chat/typing/useChatDraftTyping").ChatDraftTyping }
}

const ROOM_CHAT_BUBBLE_LIFETIME_MS = 4_000
/**
 * The room fades in once its shell and furniture are drawn, so it never
 * assembles piece by piece; entry is never held longer than this.
 */
const MINI_ROOM_STAGE_READY_CAP_MS = 320
/**
 * The room also waits for the local 2.5D avatar to load, so she arrives with it instead of popping in after the
 * fade; a slow load never holds entry longer than this.
 */
const MINI_ROOM_AVATAR_READY_CAP_MS = 1_500
const NO_HISTORY: readonly RoomChatHistoryItem[] = [], NO_NOTICES: readonly string[] = []
const NO_FAILED_MESSAGES: readonly FailedRoomMessage[] = []
const StableMiniRoomRoomDecorLayer = memo(MiniRoomRoomDecorLayer)
const StableHotspotLayer = memo(HotspotLayer), StableMiniRoomHud = memo(MiniRoomHud)
const StableMiniRoomContext = memo(MiniRoomContext)

export function MiniRoomScene(props: MiniRoomSceneProps) {
  const {
    localUser,
    partnerUser,
    copy,
    participantAvatarSnapshots,
    connectionStatus,
    voiceAvailable,
    localMedia,
    roomDecorScene,
    leaveDisabled,
    onLeave,
    onOpenSafety,
    onRetryConnect,
    onToggleMic,
    inRoomMessages,
    consumeInRoomMessage,
    consumeInRoomMessages,
    canChatSend,
    onSendRoomMessage,
    failedRoomMessage,
    failedRoomMessages = NO_FAILED_MESSAGES,
    chatHistory = NO_HISTORY,
    chatHistoryStatus = "ready",
    notices = NO_NOTICES
  } = props
  const store = useMiniRoomSceneStore({
    localUser,
    partnerUser,
    participantAvatarSnapshots,
    onLocalMove: props.roomMotion?.onLocalMove,
    onSeatTaken: props.roomMotion?.reportSeatTaken,
    roomDecorScene,
    bubbleLifetimeMs: ROOM_CHAT_BUBBLE_LIFETIME_MS
  })
  const reduceMotion = useReducedMotion()
  const partnerPresent = useMiniRoomMotionPresentation(props.roomMotion, store, localUser.userId, partnerUser.userId,
    reduceMotion)
  const motionPolicy = useMemo(
    () => resolveMiniRoomMotionPolicy(reduceMotion),
    [reduceMotion]
  )
  const [stageSize, setStageSize] = useState({
    width: ROOM_STAGE_CAMERA_FALLBACK_WIDTH,
    height: ROOM_STAGE_CAMERA_FALLBACK_HEIGHT
  })
  const [recentMessageHeight, setRecentMessageHeight] = useState(39)
  const [recentHistoryRowsHeight, setRecentHistoryRowsHeight] = useState(0)
  const [composerLines, setComposerLines] = useState(1)
  const keyboardPreference = useMiniRoomKeyboardPreference()
  // ROOM-15: the keyboard's own progress drives the whole scene on the UI thread.
  const keyboard = useMiniRoomKeyboard(reduceMotion)
  const scrollToLatest = useMiniRoomScrollToLatest(keyboard.visible)
  const { noteMessageSent, requestScrollToLatest } = scrollToLatest
  const viewport = useWindowDimensions()
  const safeAreaInsets = useSafeAreaInsets()
  const roomShell = roomDecorScene?.shell
  const { covered: stageCovered, markPainted: handleStageSceneReady } =
    useMyRoomStageCover(!roomShell, MINI_ROOM_STAGE_READY_CAP_MS)
  // The stage stays hidden until the room is drawn and the local 2.5D avatar is loaded (capped), then fades in
  // as one: her GPU surface draws from the first frame of the fade (a surface follows its parents' opacity, as
  // AvatarHero's cross-fade does), so she arrives with the room instead of after it. While hidden it draws nothing.
  const [localAvatarReady, setLocalAvatarReady] = useState(false)
  const markLocalAvatarReady = useCallback(() => setLocalAvatarReady(true), [])
  const [avatarWaitElapsed, setAvatarWaitElapsed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAvatarWaitElapsed(true), MINI_ROOM_AVATAR_READY_CAP_MS)
    return () => clearTimeout(timer)
  }, [])
  const stageHidden = stageCovered || (!localAvatarReady && !avatarWaitElapsed)
  const stageRevealStyle = useStageRevealStyle(stageHidden)
  // VIS-04: upright furniture is drawn among the avatars by floor depth.
  const depthScene = useMemo(() => createMiniRoomDepthScene(roomDecorScene), [roomDecorScene])
  // Everything the pose depends on except the keyboard (that is a progress).
  const poseInput = useMemo(
    (): MiniRoomPoseInput => ({
      windowWidth: viewport.width,
      windowHeight: viewport.height,
      safeTop: safeAreaInsets.top,
      safeBottom: safeAreaInsets.bottom,
      recentMessageHeight,
      recentHistoryRowsHeight,
      fontScale: viewport.fontScale,
      composerLines,
      roomAspectRatio: roomShell
        ? roomShell.canvasSize.width / roomShell.canvasSize.height
        : 1
    }),
    [composerLines, recentMessageHeight, recentHistoryRowsHeight, roomShell,
      safeAreaInsets.bottom, safeAreaInsets.top, viewport.fontScale, viewport.height, viewport.width]
  )
  // React only needs the discrete mode (roles, the composer's width, the
  // backdrop); every position comes from the UI-thread pose.
  const layout = useMemo(() => resolveMiniRoomLayout({
    ...poseInput, keyboardVisible: keyboard.visible, keyboardInset: 0
  }), [keyboard.visible, poseInput])
  // The transcript stays laid out at its resting viewport throughout the morph.
  const historyLayout = useMemo(() => resolveMiniRoomLayout({
    ...poseInput, keyboardVisible: false, keyboardInset: 0
  }), [poseInput])
  // The room keeps its resting frame; the keyboard framing is a UI-thread transform.
  const restCamera = useMemo(
    () => resolveMiniRoomRestCamera({ ...poseInput, keyboardVisible: false, keyboardInset: 0 }),
    [poseInput]
  )
  const { cameraStyle, transition, contentProgress } = useMiniRoomCameraTransform({
    poseInput, keyboard, reduceMotion
  })
  const {
    deferUntilArrivalLands,
    dismissSpeechBubble,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    sayPhrase,
    sayPhrases,
    playWaveGesture
  } = store
  // Chat emotes (EXPO_PUBLIC_BLUMI_CHAT_EMOTES, off by default): derived here from the lines this phone shows.
  // A greeting also plays the rig's wave, except under Reduce Motion, where the badge stays still.
  const animateEmoteGesture = motionPolicy.animateSpeaking
  const handleEmote = useCallback((speakerUserId: string, emote: ChatEmote): void => {
    if (emote === "wave" && animateEmoteGesture) playWaveGesture(speakerUserId, MINI_ROOM_EMOTE_LIFETIME_MS)
  }, [animateEmoteGesture, playWaveGesture])
  const { emotes, noteChatMessage } = useMiniRoomChatEmotes({ onEmote: handleEmote })

  const [partnerJustJoined, setPartnerJustJoined] = useState(false)
  // The scene follows the keyboard down: nothing collapses ahead of it.
  const handleCloseKeyboard = useCallback(() => {
    Keyboard.dismiss()
  }, [])

  useEffect(() => {
    if (!motionPolicy.animateJoin || !partnerPresent) {
      setPartnerJustJoined(false)
      return
    }
    setPartnerJustJoined(true)
    const timer = setTimeout(
      () => setPartnerJustJoined(false),
      MINI_ROOM_PARTNER_ARRIVAL_MS
    )
    return () => clearTimeout(timer)
  }, [motionPolicy.animateJoin, partnerPresent, partnerUser.userId])

  const announcedPartnerUserIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!partnerPresent) { announcedPartnerUserIdRef.current = null; return }
    if (!shouldAnnouncePartnerJoin({
      connected: partnerPresent,
      partnerUserId: partnerUser.userId,
      announcedPartnerUserId: announcedPartnerUserIdRef.current
    })) return
    announcedPartnerUserIdRef.current = partnerUser.userId
    // A walk in from the door is felt when it lands, not when it starts.
    if (deferUntilArrivalLands(partnerUser.userId, hapticSoft)) return
    hapticSoft()
  }, [deferUntilArrivalLands, partnerPresent, partnerUser.userId])

  useEffect(() => {
    if (inRoomMessages.length === 0) return
    sayPhrases(inRoomMessages.map((message) => ({ speakerUserId: message.senderUserId, body: message.body, tone: "chat" })))
    for (const message of inRoomMessages) {
      noteChatMessage({ senderUserId: message.senderUserId, body: message.body, sentAtMs: message.sentAt })
    }
    if (consumeInRoomMessages) consumeInRoomMessages(inRoomMessages.map((message) => message.messageId))
    else for (const message of inRoomMessages) consumeInRoomMessage(message.messageId)
  }, [consumeInRoomMessage, consumeInRoomMessages, inRoomMessages, noteChatMessage, sayPhrases])

  // Floor gestures are already mapped into room coordinates by RoomFloorTapLayer.
  // Moving avatars never move the camera; the fixed room frame only adapts to
  // the keyboard pose so the composer stays usable.
  const handleRoomTap = useCallback(
    (target: { x: number; y: number }): void => {
      moveLocalAvatar(target)
    },
    [moveLocalAvatar]
  )

  const handleHotspotSelect = useCallback((hotspotId: string, alternatives?: readonly string[]): void => {
    moveLocalAvatarToHotspot(hotspotId, alternatives)
  }, [moveLocalAvatarToHotspot])

  const handleSubmitComposer = useCallback((body: string, retryClientMessageId?: string): boolean => {
    if (!onSendRoomMessage(body, retryClientMessageId)) return false
    sayPhrase(localUser.userId, body, "chat")
    noteChatMessage({ senderUserId: localUser.userId, body })
    // The keyboard stays up for the next message; the input returns to one line.
    setComposerLines(1)
    // Once the keyboard is down, the transcript shows this message.
    noteMessageSent()
    return true
  }, [localUser.userId, noteChatMessage, noteMessageSent, onSendRoomMessage, sayPhrase])

  const handleToggleHistory = useCallback((): void => {
    handleCloseKeyboard()
    requestScrollToLatest()
  }, [handleCloseKeyboard, requestScrollToLatest])

  const handleComposerContentSize = useCallback((contentHeight: number): void => {
    const lines = resolveComposerLineCount({ contentHeight, fontScale: viewport.fontScale })
    setComposerLines((current) => current === lines ? current : lines)
  }, [viewport.fontScale])

  const composer = useMemo(() => (
    <RoomChatComposer suggestionsEnabled={keyboardPreference.suggestionsEnabled} copy={copy}
      mode={layout.panelMode} maxInputHeight={layout.composerMaxInputHeight} inputHeight={layout.composerInputHeight}
      onSubmit={handleSubmitComposer} failedMessages={failedRoomMessages} onToggleHistory={handleToggleHistory}
      onContentHeightChange={handleComposerContentSize} disabled={!canChatSend} draftTyping={props.typing?.draft} />
  ), [canChatSend, copy, failedRoomMessages, handleComposerContentSize, handleSubmitComposer, handleToggleHistory,
    keyboardPreference.suggestionsEnabled, layout.composerInputHeight, layout.composerMaxInputHeight, layout.panelMode,
    props.typing?.draft])

  const handleStageLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    setStageSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }, [])

  const partnerFirstName = useMemo(
    () => partnerUser.displayName.split(" ")[0] || partnerUser.displayName,
    [partnerUser.displayName]
  )

  const hudNotices = useMemo(
    () => failedRoomMessage?.clientMessageId ? [...notices, copy.sendFailedNotice] : notices,
    [copy.sendFailedNotice, failedRoomMessage, notices]
  )

  // One hotspot and avatar layer serve both the room-shell camera and the legacy map.
  const hotspotLayer = (
    <StableHotspotLayer
      hotspots={store.hotspots}
      interaction={store.interaction}
      stageWidth={stageSize.width}
      stageHeight={stageSize.height}
      onSelect={handleHotspotSelect}
      disabled={connectionStatus !== "connected"}
    />
  )
  const floorTapLayer = (
    <RoomFloorTapLayer
      accessibilityLabel={copy.moveAvatar}
      accessibilityHint={copy.moveAvatarHint}
      onTap={handleRoomTap}
      testID="mini-room-floor"
    />
  )
  const avatarLayer = (
    <AvatarLayer
      avatars={store.avatars}
      avatarPositions={store.avatarPositions}
      localUserId={localUser.userId}
      localUserLabel={copy.youLabel}
      bubbles={store.bubbles}
      onDismissBubble={dismissSpeechBubble}
      dismissBubbleLabel={copy.dismissRoomMessage}
      partnerJustJoined={partnerJustJoined && partnerPresent}
      typingUserId={props.typing?.partnerTyping ? partnerUser.userId : undefined}
      motionPolicy={motionPolicy}
      depthScene={depthScene}
      holdGpuSurfaces={stageHidden}
      onLocalAvatarReady={markLocalAvatarReady}
      emotes={emotes}
    />
  )

  return (
    <View style={styles.root}>
      <View pointerEvents="box-none" style={styles.roomStageFrame}>
        {roomDecorScene?.shell ? (
          <Reanimated.View
            pointerEvents="box-none"
            style={[styles.roomWorldCamera, restCamera, cameraStyle, stageRevealStyle]}
            onLayout={handleStageLayout}
          >
            {floorTapLayer}
            <StableMiniRoomRoomDecorLayer
              scene={roomDecorScene}
              interaction={store.interaction}
              occluderIds={depthScene.occluderIds}
              onSceneReady={handleStageSceneReady}
            />
            {hotspotLayer}
            {avatarLayer}
          </Reanimated.View>
        ) : null}
      </View>

      <MiniRoomChatPanel
        windowWidth={viewport.width}
        windowHeight={viewport.height}
        copy={copy}
        mode={layout.panelMode}
        transition={transition}
        contentProgress={contentProgress}
        historyHeight={historyLayout.historyHeight}
        historyItems={chatHistory}
        historyStatus={chatHistoryStatus}
        partnerName={partnerFirstName}
        recentMessage={chatHistory[0]}
        onRecentHeightChange={setRecentMessageHeight}
        onRecentRowsHeightChange={setRecentHistoryRowsHeight}
        onCloseKeyboard={handleCloseKeyboard}
        scrollToLatestRequest={scrollToLatest.request}
      >
        {composer}
      </MiniRoomChatPanel>

      <StableMiniRoomContext copy={copy} top={layout.contextTop} contentProgress={contentProgress}
        visible={layout.historyVisible} partnerName={partnerFirstName} snapshots={participantAvatarSnapshots} />

      <StableMiniRoomHud
        partnerFirstName={partnerFirstName}
        connectionStatus={connectionStatus}
        voiceAvailable={voiceAvailable}
        localMedia={localMedia}
        copy={copy}
        leaveDisabled={leaveDisabled}
        horizontalInset={layout.horizontalInset}
        headerTop={layout.headerTop}
        headerBottom={layout.headerBottom}
        notices={hudNotices}
        onLeave={onLeave}
        onOpenSafety={onOpenSafety}
        onRetryConnect={onRetryConnect}
        onToggleMic={onToggleMic}
        suggestionsEnabled={keyboardPreference.suggestionsEnabled}
        onToggleSuggestions={keyboardPreference.toggle}
      />
    </View>
  )
}

const ROOM_STAGE_CAMERA_FALLBACK_WIDTH = 920
const ROOM_STAGE_CAMERA_FALLBACK_HEIGHT = 524

const styles = StyleSheet.create({
  // Powder-pink and lavender atmosphere shared with Wardrobe and the room editor.
  root: {
    flex: 1,
    backgroundColor: "#FFF7FA",
    experimental_backgroundImage: "linear-gradient(145deg, #FBE1EC 0%, #FCF6FA 43%, #E9DEFB 100%)"
  },
  roomStageFrame: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden"
  },
  roomWorldCamera: {
    position: "absolute",
    overflow: "visible",
    backgroundColor: "transparent"
  },
})
