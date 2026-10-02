import type { GestureResponderEvent, LayoutChangeEvent } from "react-native"
import {
  Keyboard,
  Pressable,
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
import { resolveComposerRestore, resolveRoomComposerSubmit } from "../roomComposerModel"
import { useReducedMotion } from "../../../ui/animations"
import { hapticSoft } from "../../../ui/haptics"
import { AvatarLayer } from "./AvatarLayer"
import { HotspotLayer } from "./HotspotLayer"
import { MiniRoomChatPanel } from "./MiniRoomChatPanel"
import { MiniRoomContext } from "./MiniRoomContext"
import { MiniRoomHud } from "./MiniRoomHud"
import { MiniRoomRoomDecorLayer } from "./MiniRoomRoomDecorLayer"
import { MAX_ROOM_MESSAGE_LENGTH, RoomChatComposer } from "./RoomChatComposer"
import { RoomMapLayer } from "./RoomMapLayer"
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
import { useMiniRoomKeyboardPreference } from "../useMiniRoomKeyboardPreference"

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)
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
  roomDecorScene?: ResolvedRoomV2Scene
  leaveDisabled: boolean
  onLeave: () => void
  onOpenSafety: () => void
  onRetryConnect: () => void
  onToggleMic: () => void
  inRoomMessages: InRoomChatMessageEvent[]
  consumeInRoomMessage: (messageId: string) => void
  canChatSend: boolean
  onSendRoomMessage: (body: string) => boolean
  /** Latest room message the server did not acknowledge (useInRoomChat). */
  failedRoomMessage?: FailedRoomMessage | null
  /** Durable room conversation, newest first (useRoomChatHistory). */
  chatHistory?: readonly RoomChatHistoryItem[]
  chatHistoryStatus?: RoomChatHistoryStatus
  /** Screen-level alerts shown under the header. */
  notices?: readonly string[]
  /** Typing (chat_typing): dots over the partner and this device's draft signal. */
  typing?: { partnerTyping: boolean; draft: import("../../chat/typing/useChatDraftTyping").ChatDraftTyping }
}

const ROOM_CHAT_BUBBLE_LIFETIME_MS = 4_000
const NO_HISTORY: readonly RoomChatHistoryItem[] = [], NO_NOTICES: readonly string[] = []
const StableMiniRoomRoomDecorLayer = memo(MiniRoomRoomDecorLayer), StableRoomMapLayer = memo(RoomMapLayer)
const StableHotspotLayer = memo(HotspotLayer), StableMiniRoomHud = memo(MiniRoomHud)

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
    canChatSend,
    onSendRoomMessage,
    failedRoomMessage,
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
  const [scrollToLatestRequest, setScrollToLatestRequest] = useState(0)
  const [recentMessageHeight, setRecentMessageHeight] = useState(39)
  const [recentHistoryRowsHeight, setRecentHistoryRowsHeight] = useState(0)
  const [composerLines, setComposerLines] = useState(1)
  const keyboardPreference = useMiniRoomKeyboardPreference()
  const keyboard = useMiniRoomKeyboard((frame) => animateKeyboard(frame))
  const viewport = useWindowDimensions()
  const safeAreaInsets = useSafeAreaInsets()
  const roomShell = roomDecorScene?.shell
  // VIS-04: upright furniture is drawn among the avatars by floor depth.
  const depthScene = useMemo(() => createMiniRoomDepthScene(roomDecorScene), [roomDecorScene])
  const layoutInput = useMemo(
    () => ({
      windowWidth: viewport.width,
      windowHeight: viewport.height,
      safeTop: safeAreaInsets.top,
      safeBottom: safeAreaInsets.bottom,
      keyboardVisible: keyboard.visible,
      keyboardInset: keyboard.inset,
      recentMessageHeight,
      recentHistoryRowsHeight,
      fontScale: viewport.fontScale,
      composerLines,
      roomAspectRatio: roomShell
        ? roomShell.canvasSize.width / roomShell.canvasSize.height
        : 1
    }),
    [composerLines, recentMessageHeight, recentHistoryRowsHeight, keyboard.inset, keyboard.visible, roomShell,
      safeAreaInsets.bottom, safeAreaInsets.top, viewport.fontScale, viewport.height, viewport.width]
  )
  const layout = useMemo(() => resolveMiniRoomLayout(layoutInput), [layoutInput])
  // Keep the transcript mounted at its resting viewport throughout the morph.
  const historyLayout = useMemo(() => resolveMiniRoomLayout({
    ...layoutInput, keyboardVisible: false, keyboardInset: 0
  }), [layoutInput])
  // ROOM-15: the room keeps its resting frame; the keyboard framing is a UI-thread transform.
  const restCamera = useMemo(
    () => resolveMiniRoomRestCamera(layoutInput),
    [layoutInput]
  )
  const { cameraStyle, transition, contentProgress, animateKeyboard, prepareKeyboardOpen } = useMiniRoomCameraTransform({
    rest: restCamera, layout, layoutInput, keyboardInset: keyboard.inset,
    keyboardDurationMs: keyboard.durationMs, reduceMotion
  })
  const {
    dismissSpeechBubble,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    sayPhrase
  } = store

  const [partnerJustJoined, setPartnerJustJoined] = useState(false)
  const [composerText, setComposerText] = useState("")
  const handleCloseKeyboard = useCallback(() => {
    // Begin the return before requesting UIKit dismissal, not after its layout.
    animateKeyboard({ visible: false, inset: 0, durationMs: keyboard.durationMs }, "intent")
    Keyboard.dismiss()
  }, [animateKeyboard, keyboard.durationMs])

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
    if (store.deferUntilArrivalLands(partnerUser.userId, hapticSoft)) return
    hapticSoft()
  }, [partnerPresent, partnerUser.userId, store.deferUntilArrivalLands])

  useEffect(() => {
    if (inRoomMessages.length === 0) return
    for (const message of inRoomMessages) {
      sayPhrase(message.senderUserId, message.body, "chat")
      consumeInRoomMessage(message.messageId)
    }
  }, [consumeInRoomMessage, inRoomMessages, sayPhrase])

  const handleRoomPress = useCallback(
    (event: GestureResponderEvent): void => {
      handleCloseKeyboard()
      const { locationX, locationY } = event.nativeEvent
      moveLocalAvatar({
        x: Math.max(0, Math.min(1, locationX / stageSize.width)),
        y: Math.max(0, Math.min(1, locationY / stageSize.height))
      })
    },
    [handleCloseKeyboard, moveLocalAvatar, stageSize.height, stageSize.width]
  )

  const handleHotspotSelect = useCallback((hotspotId: string): void => {
    handleCloseKeyboard()
    moveLocalAvatarToHotspot(hotspotId)
  }, [handleCloseKeyboard, moveLocalAvatarToHotspot])

  const handleSubmitComposer = useCallback((): void => {
    const result = resolveRoomComposerSubmit(composerText, onSendRoomMessage)
    if (result.kind !== "sent") return
    sayPhrase(localUser.userId, result.body, "chat")
    // The keyboard stays up for the next message; the input returns to one line.
    setComposerText("")
    setComposerLines(1)
  }, [composerText, localUser.userId, onSendRoomMessage, sayPhrase])

  // An unacknowledged message comes back into an empty composer: sending the
  // same text again retries it with the same client id. The hook publishes a
  // new object only per failure, so this runs once per failed message.
  useEffect(() => {
    if (!failedRoomMessage?.clientMessageId) return
    setComposerText((current) => resolveComposerRestore(current, failedRoomMessage))
  }, [failedRoomMessage])

  const handleComposerChange = useCallback((value: string): void => {
    setComposerText(value.slice(0, MAX_ROOM_MESSAGE_LENGTH))
    if (value.length === 0) setComposerLines(1)
  }, [])

  const handleToggleHistory = useCallback((): void => {
    handleCloseKeyboard()
    setScrollToLatestRequest((request) => request + 1)
  }, [handleCloseKeyboard])

  const handleComposerContentSize = useCallback((contentHeight: number): void => {
    const lines = resolveComposerLineCount({ contentHeight, fontScale: viewport.fontScale })
    setComposerLines((current) => current === lines ? current : lines)
  }, [viewport.fontScale])

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

  const composerDisabled = !canChatSend
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
    />
  )

  return (
    <View style={styles.root}>
      {layout.panelMode === "typing" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.closeKeyboard}
          style={StyleSheet.absoluteFill}
          onPress={handleCloseKeyboard}
        />
      ) : null}
      <View pointerEvents="box-none" style={styles.roomStageFrame}>
        {roomDecorScene?.shell ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={copy.moveAvatar}
            accessibilityHint={copy.moveAvatarHint}
            style={[styles.roomWorldCamera, restCamera, cameraStyle]}
            onLayout={handleStageLayout}
            onPress={handleRoomPress}
          >
            <StableMiniRoomRoomDecorLayer
              scene={roomDecorScene}
              interaction={store.interaction}
              occluderIds={depthScene.occluderIds}
            />
            {hotspotLayer}
            {avatarLayer}
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={copy.moveAvatar}
            accessibilityHint={copy.moveAvatarHint}
            style={[styles.legacyRoomStage, { top: restCamera.top }, cameraStyle]}
            onLayout={handleStageLayout}
            onPress={handleRoomPress}
          >
            <StableRoomMapLayer scene={store.scene} interaction={store.interaction} />
            {hotspotLayer}
            {avatarLayer}
          </AnimatedPressable>
        )}
      </View>

      <MiniRoomChatPanel
        windowWidth={viewport.width}
        copy={copy}
        mode={layout.panelMode}
        transition={transition}
        contentProgress={contentProgress}
        historyHeight={historyLayout.historyHeight}
        composerHeight={layout.composerInputHeight}
        historyItems={chatHistory}
        historyStatus={chatHistoryStatus}
        partnerName={partnerFirstName}
        recentMessage={chatHistory[0]}
        onRecentHeightChange={setRecentMessageHeight}
        onRecentRowsHeightChange={setRecentHistoryRowsHeight}
        onCloseKeyboard={handleCloseKeyboard}
        scrollToLatestRequest={scrollToLatestRequest}
      >
        <RoomChatComposer
          value={composerText}
          suggestionsEnabled={keyboardPreference.suggestionsEnabled}
          copy={copy}
          mode={layout.panelMode}
          maxInputHeight={layout.composerMaxInputHeight}
          inputHeight={layout.composerInputHeight}
          onChangeText={handleComposerChange}
          onSubmit={handleSubmitComposer}
          onToggleHistory={handleToggleHistory}
          onContentHeightChange={handleComposerContentSize}
          onFocus={prepareKeyboardOpen}
          disabled={composerDisabled}
          draftTyping={props.typing?.draft}
        />
      </MiniRoomChatPanel>

      <MiniRoomContext copy={copy} top={layout.contextTop} contentProgress={contentProgress}
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
  legacyRoomStage: {
    position: "absolute",
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1,
    overflow: "hidden",
    backgroundColor: "#F8ECF2"
  },
})
