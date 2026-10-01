import Ionicons from "@expo/vector-icons/Ionicons"
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native"
import {
  Animated,
  Easing,
  Keyboard,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { FailedRoomMessage, InRoomChatMessageEvent } from "../useInRoomChat"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import { uiTheme } from "../../../ui/theme"
import { useReducedMotion } from "../../../ui/animations"
import { hapticLight } from "../../../ui/haptics"
import { AvatarLayer } from "./AvatarLayer"
import { HotspotLayer } from "./HotspotLayer"
import { MiniRoomChatPanel } from "./MiniRoomChatPanel"
import { MiniRoomHud } from "./MiniRoomHud"
import { MiniRoomRoomDecorLayer } from "./MiniRoomRoomDecorLayer"
import { MAX_ROOM_MESSAGE_LENGTH, RoomChatComposer } from "./RoomChatComposer"
import { RoomMapLayer } from "./RoomMapLayer"
import { useMiniRoomSceneStore } from "./miniRoomSceneStore"
import {
  MINI_ROOM_ENTRY_DURATION_MS,
  MINI_ROOM_PARTNER_ARRIVAL_MS,
  MINI_ROOM_WELCOME_FADE_MS,
  MINI_ROOM_WELCOME_HOLD_MS,
  MINI_ROOM_WELCOME_REVEAL_MS,
  resolveMiniRoomMotionPolicy,
  type MiniRoomMotionPolicy
} from "./miniRoomReducedMotion"
import type { MiniRoomParticipantAvatarSnapshots } from "./miniRoomSceneTypes"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { shouldAnnouncePartnerJoin } from "./miniRoomPresentation"
import {
  resolveComposerLineCount,
  resolveMiniRoomLayout
} from "./miniRoomLayout"
import { useMiniRoomKeyboard } from "./useMiniRoomKeyboard"
import { useMiniRoomMotionPresentation } from "./useMiniRoomMotionPresentation"

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
const NO_HISTORY: readonly RoomChatHistoryItem[] = []
const NO_NOTICES: readonly string[] = []
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
    roomDecorScene,
    bubbleLifetimeMs: ROOM_CHAT_BUBBLE_LIFETIME_MS
  })
  const partnerPresent = useMiniRoomMotionPresentation(props.roomMotion, store, localUser.userId, partnerUser.userId)
  const reduceMotion = useReducedMotion()
  const motionPolicy = useMemo(
    () => resolveMiniRoomMotionPolicy(reduceMotion),
    [reduceMotion]
  )
  const [stageSize, setStageSize] = useState({
    width: ROOM_STAGE_CAMERA_FALLBACK_WIDTH,
    height: ROOM_STAGE_CAMERA_FALLBACK_HEIGHT
  })
  const [chatExpanded, setChatExpanded] = useState(true)
  const [composerLines, setComposerLines] = useState(1)
  const keyboard = useMiniRoomKeyboard(reduceMotion)
  const viewport = useWindowDimensions()
  const safeAreaInsets = useSafeAreaInsets()
  const roomShell = roomDecorScene?.shell
  const layout = useMemo(
    () => resolveMiniRoomLayout({
      windowWidth: viewport.width,
      windowHeight: viewport.height,
      safeTop: safeAreaInsets.top,
      safeBottom: safeAreaInsets.bottom,
      keyboardVisible: keyboard.visible,
      keyboardInset: keyboard.inset,
      chatExpanded,
      fontScale: viewport.fontScale,
      composerLines,
      roomAspectRatio: roomShell
        ? roomShell.canvasSize.width / roomShell.canvasSize.height
        : 1
    }),
    [
      chatExpanded,
      composerLines,
      keyboard.inset,
      keyboard.visible,
      roomShell,
      safeAreaInsets.bottom,
      safeAreaInsets.top,
      viewport.fontScale,
      viewport.height,
      viewport.width
    ]
  )
  const {
    dismissSpeechBubble,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    sayPhrase
  } = store

  const entryValueRef = useRef(new Animated.Value(0)).current
  const welcomeValueRef = useRef(new Animated.Value(0)).current
  const [partnerJustJoined, setPartnerJustJoined] = useState(false)
  const [composerText, setComposerText] = useState("")

  useEffect(() => {
    entryValueRef.stopAnimation()
    if (!motionPolicy.animateJoin) {
      entryValueRef.setValue(1)
      return
    }
    const animation = Animated.timing(entryValueRef, {
      toValue: 1,
      duration: MINI_ROOM_ENTRY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [entryValueRef, motionPolicy.animateJoin])

  useEffect(() => {
    welcomeValueRef.stopAnimation()
    if (!partnerPresent) { welcomeValueRef.setValue(0); return }
    welcomeValueRef.setValue(motionPolicy.animateJoin ? 0 : 1)

    const animation = motionPolicy.animateJoin
      ? Animated.sequence([
          Animated.timing(welcomeValueRef, {
            toValue: 1,
            duration: MINI_ROOM_WELCOME_REVEAL_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.delay(MINI_ROOM_WELCOME_HOLD_MS),
          Animated.timing(welcomeValueRef, {
            toValue: 0,
            duration: MINI_ROOM_WELCOME_FADE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ])
      : Animated.sequence([
          Animated.delay(MINI_ROOM_WELCOME_HOLD_MS),
          Animated.timing(welcomeValueRef, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          })
        ])

    animation.start()
    return () => animation.stop()
  }, [motionPolicy.animateJoin, partnerPresent, partnerUser.userId, welcomeValueRef])

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
    hapticLight()
  }, [partnerPresent, partnerUser.userId])

  useEffect(() => {
    if (inRoomMessages.length === 0) return
    for (const message of inRoomMessages) {
      sayPhrase(message.senderUserId, message.body, "chat")
      consumeInRoomMessage(message.messageId)
    }
  }, [consumeInRoomMessage, inRoomMessages, sayPhrase])

  const handleRoomPress = useCallback(
    (event: GestureResponderEvent): void => {
      Keyboard.dismiss()
      const { locationX, locationY } = event.nativeEvent
      moveLocalAvatar({
        x: Math.max(0, Math.min(1, locationX / stageSize.width)),
        y: Math.max(0, Math.min(1, locationY / stageSize.height))
      })
    },
    [moveLocalAvatar, stageSize.height, stageSize.width]
  )

  const handleHotspotSelect = useCallback((hotspotId: string): void => {
    Keyboard.dismiss()
    moveLocalAvatarToHotspot(hotspotId)
  }, [moveLocalAvatarToHotspot])

  const handleSubmitComposer = useCallback((): void => {
    const body = composerText.trim()
    if (!body) {
      return
    }
    const accepted = onSendRoomMessage(body)
    if (!accepted) return
    sayPhrase(localUser.userId, body, "chat")
    // The keyboard stays up for the next message; the input returns to one line.
    setComposerText("")
  }, [composerText, localUser.userId, onSendRoomMessage, sayPhrase])

  // An unacknowledged message comes back into an empty composer: sending the
  // same text again retries it with the same client id. The hook publishes a
  // new object only per failure, so this runs once per failed message.
  useEffect(() => {
    if (!failedRoomMessage?.clientMessageId) return
    setComposerText((current) => current || failedRoomMessage.body)
  }, [failedRoomMessage])

  const handleComposerChange = useCallback((value: string): void => {
    setComposerText(value.slice(0, MAX_ROOM_MESSAGE_LENGTH))
  }, [])

  const handleToggleHistory = useCallback((): void => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    if (layout.panelMode === "typing") {
      // "Back to the room": close the keyboard and leave only the composer.
      Keyboard.dismiss()
      setChatExpanded(false)
      return
    }
    setChatExpanded((expanded) => !expanded)
  }, [layout.panelMode, reduceMotion])

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

  const entryOpacity = entryValueRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  })
  const entryScale = entryValueRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1]
  })
  const entryTranslateY = entryValueRef.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0]
  })
  const welcomeOpacity = welcomeValueRef

  const partnerFirstName = useMemo(
    () => partnerUser.displayName.split(" ")[0] || partnerUser.displayName,
    [partnerUser.displayName]
  )

  const closeTogether =
    store.interaction.proximityClose && connectionStatus === "connected"

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
    />
  )

  return (
    <View style={styles.root}>
      {layout.panelMode === "typing" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.closeKeyboard}
          style={StyleSheet.absoluteFill}
          onPress={Keyboard.dismiss}
        />
      ) : null}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.roomStageFrame,
          {
            opacity: entryOpacity,
            transform: [
              { translateY: entryTranslateY },
              { scale: entryScale }
            ]
          }
        ]}
      >
        {roomDecorScene?.shell ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.moveAvatar}
            accessibilityHint={copy.moveAvatarHint}
            style={[styles.roomWorldCamera, layout.camera]}
            onLayout={handleStageLayout}
            onPress={handleRoomPress}
          >
            <StableMiniRoomRoomDecorLayer
              scene={roomDecorScene}
              interaction={store.interaction}
            />
            {hotspotLayer}
            <TogetherHeartOverlay active={closeTogether} motionPolicy={motionPolicy} />
            {avatarLayer}
            <Animated.View
              style={[styles.welcomeRibbon, { opacity: welcomeOpacity }]}
              pointerEvents="none"
            >
              <Text style={styles.welcomeText} numberOfLines={1}>
                {copy.welcome(partnerFirstName)}
              </Text>
            </Animated.View>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.moveAvatar}
            accessibilityHint={copy.moveAvatarHint}
            style={[styles.legacyRoomStage, { top: layout.camera.top }]}
            onLayout={handleStageLayout}
            onPress={handleRoomPress}
          >
            <StableRoomMapLayer scene={store.scene} interaction={store.interaction} />
            {hotspotLayer}
            {avatarLayer}
          </Pressable>
        )}
      </Animated.View>

      <MiniRoomChatPanel
        copy={copy}
        mode={layout.panelMode}
        margin={layout.panelMargin}
        bottom={layout.panelBottom}
        historyHeight={layout.historyHeight}
        historyItems={chatHistory}
        historyStatus={chatHistoryStatus}
        partnerName={partnerFirstName}
      >
        <RoomChatComposer
          value={composerText}
          copy={copy}
          mode={layout.panelMode}
          maxInputHeight={layout.composerMaxInputHeight}
          onChangeText={handleComposerChange}
          onSubmit={handleSubmitComposer}
          onToggleHistory={handleToggleHistory}
          onContentHeightChange={handleComposerContentSize}
          disabled={composerDisabled}
          draftTyping={props.typing?.draft}
        />
      </MiniRoomChatPanel>

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
      />
    </View>
  )
}

interface TogetherHeartOverlayProps {
  active: boolean
  motionPolicy: MiniRoomMotionPolicy
}

const TogetherHeartOverlay = memo(function TogetherHeartOverlay(
  props: TogetherHeartOverlayProps
) {
  const { active, motionPolicy } = props
  const pulseRef = useRef(new Animated.Value(0)).current
  const fadeRef = useRef(new Animated.Value(0)).current

  useEffect(() => {
    fadeRef.stopAnimation()
    if (!motionPolicy.animateHeart) {
      fadeRef.setValue(active ? 1 : 0)
      return
    }
    const animation = Animated.timing(fadeRef, {
      toValue: active ? 1 : 0,
      duration: motionPolicy.transitionDuration,
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [active, fadeRef, motionPolicy.animateHeart, motionPolicy.transitionDuration])

  useEffect(() => {
    if (!active || !motionPolicy.animateHeart) {
      pulseRef.stopAnimation()
      pulseRef.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRef, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(pulseRef, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [active, motionPolicy.animateHeart, pulseRef])

  const scale = pulseRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.12]
  })
  const translateY = pulseRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6]
  })

  return (
    <View style={styles.togetherWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.togetherInner,
          {
            opacity: fadeRef,
            transform: [{ scale }, { translateY }]
          }
        ]}
      >
          <Ionicons
            accessible={false}
            name="sparkles-outline"
            size={21}
            color={uiTheme.colors.brandLavender}
          />
      </Animated.View>
    </View>
  )
})

const ROOM_STAGE_CAMERA_FALLBACK_WIDTH = 920
const ROOM_STAGE_CAMERA_FALLBACK_HEIGHT = 524

const styles = StyleSheet.create({
  // Powder-pink and lavender atmosphere shared with Wardrobe and the room editor.
  root: {
    flex: 1,
    backgroundColor: "#FFF7FA",
    experimental_backgroundImage:
      "radial-gradient(ellipse at 10% 34%, rgba(249, 222, 235, 1) 0%, rgba(249, 222, 235, 0) 60%), " +
      "radial-gradient(ellipse at 92% 48%, rgba(230, 221, 240, 1) 0%, rgba(230, 221, 240, 0) 60%)"
  },
  roomStageFrame: {
    ...StyleSheet.absoluteFill
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
  /* ── Welcome Ribbon ────────────── */
  welcomeRibbon: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
  },
  welcomeText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.brandPlum,
    letterSpacing: 0.4,
  },
  /* ── Together Heart ────────────── */
  togetherWrap: {
    position: "absolute",
    top: "34%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  togetherInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(221, 205, 255, 0.78)",
    shadowColor: "#B8A9E8",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
})
