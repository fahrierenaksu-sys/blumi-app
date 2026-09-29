import Ionicons from "@expo/vector-icons/Ionicons"
import { BlurTargetView, BlurView } from "expo-blur"
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native"
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { InRoomChatMessageEvent } from "../useInRoomChat"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import { ROOM_V2_OUTSIDE_COLOR } from "../../roomV2/roomV2Camera"
import { uiTheme } from "../../../ui/theme"
import { useReducedMotion } from "../../../ui/animations"
import { AvatarLayer } from "./AvatarLayer"
import { HotspotLayer } from "./HotspotLayer"
import { MiniRoomHud } from "./MiniRoomHud"
import { MiniRoomRoomDecorLayer } from "./MiniRoomRoomDecorLayer"
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
import { resolveMiniRoomPresentation } from "./miniRoomPresentation"

interface MiniRoomSceneProps {
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
}

const ROOM_CHAT_BUBBLE_LIFETIME_MS = 4_000
const MAX_ROOM_MESSAGE_LENGTH = 140
const StableMiniRoomRoomDecorLayer = memo(MiniRoomRoomDecorLayer)
const StableRoomMapLayer = memo(RoomMapLayer)
const StableHotspotLayer = memo(HotspotLayer)
const StableMiniRoomHud = memo(MiniRoomHud)

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
    onSendRoomMessage
  } = props
  const store = useMiniRoomSceneStore({
    localUser,
    partnerUser,
    participantAvatarSnapshots,
    roomDecorScene,
    bubbleLifetimeMs: ROOM_CHAT_BUBBLE_LIFETIME_MS
  })
  const reduceMotion = useReducedMotion()
  const motionPolicy = useMemo(
    () => resolveMiniRoomMotionPolicy(reduceMotion),
    [reduceMotion]
  )
  const [stageSize, setStageSize] = useState({
    width: ROOM_STAGE_CAMERA_FALLBACK_WIDTH,
    height: ROOM_STAGE_CAMERA_FALLBACK_HEIGHT
  })
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const viewport = useWindowDimensions()
  const safeAreaInsets = useSafeAreaInsets()
  const blurTargetRef = useRef<View | null>(null)
  const presentation = useMemo(
    () => resolveMiniRoomPresentation({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      keyboardVisible
    }),
    [keyboardVisible, viewport.height, viewport.width]
  )
  const {
    dismissSpeechBubble,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    sayPhrase
  } = store

  const entryValueRef = useRef(new Animated.Value(0)).current
  const welcomeValueRef = useRef(new Animated.Value(0)).current
  const [partnerJustJoined, setPartnerJustJoined] = useState(true)
  const [composerText, setComposerText] = useState("")

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

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
  }, [motionPolicy.animateJoin, partnerUser.userId, welcomeValueRef])

  useEffect(() => {
    if (!motionPolicy.animateJoin) {
      setPartnerJustJoined(false)
      return
    }
    setPartnerJustJoined(true)
    const timer = setTimeout(
      () => setPartnerJustJoined(false),
      MINI_ROOM_PARTNER_ARRIVAL_MS
    )
    return () => clearTimeout(timer)
  }, [motionPolicy.animateJoin, partnerUser.userId])

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
    if (accepted) {
      sayPhrase(localUser.userId, body, "chat")
    }
    setComposerText("")
    Keyboard.dismiss()
  }, [composerText, localUser.userId, onSendRoomMessage, sayPhrase])

  const handleComposerChange = useCallback((value: string): void => {
    setComposerText(value.slice(0, MAX_ROOM_MESSAGE_LENGTH))
  }, [])

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
  const roomCamera = roomDecorScene?.shell
    ? {
        width: `${presentation.cameraWidthPercent}%` as `${number}%`,
        top: presentation.cameraTop,
        aspectRatio:
          roomDecorScene.shell.canvasSize.width /
          roomDecorScene.shell.canvasSize.height,
        backgroundColor: "transparent"
      }
    : null

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BlurTargetView ref={blurTargetRef} style={styles.blurTarget}>
        <View style={styles.roomWrap}>
          <Animated.View
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
            {roomCamera && roomDecorScene ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.moveAvatar}
                accessibilityHint={copy.moveAvatarHint}
                style={[
                  styles.roomWorldCamera,
                  {
                    width: roomCamera.width,
                    top: roomCamera.top,
                    aspectRatio: roomCamera.aspectRatio,
                    backgroundColor: roomCamera.backgroundColor
                  }
                ]}
                onLayout={handleStageLayout}
                onPress={handleRoomPress}
              >
                <StableMiniRoomRoomDecorLayer
                  scene={roomDecorScene}
                  interaction={store.interaction}
                />
                <StableHotspotLayer
                  hotspots={store.hotspots}
                  interaction={store.interaction}
                  stageWidth={stageSize.width}
                  stageHeight={stageSize.height}
                  onSelect={handleHotspotSelect}
                  disabled={connectionStatus !== "connected"}
                />
                <TogetherHeartOverlay active={closeTogether} motionPolicy={motionPolicy} />
                <AvatarLayer
                  avatars={store.avatars}
                  localUserId={localUser.userId}
                  localUserLabel={copy.youLabel}
                  bubbles={store.bubbles}
                  onDismissBubble={dismissSpeechBubble}
                  dismissBubbleLabel={copy.dismissRoomMessage}
                  partnerJustJoined={partnerJustJoined && connectionStatus === "connected"}
                  motionPolicy={motionPolicy}
                />
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
                style={styles.legacyRoomStage}
                onLayout={handleStageLayout}
                onPress={handleRoomPress}
              >
                <StableRoomMapLayer scene={store.scene} interaction={store.interaction} />
                <StableHotspotLayer
                  hotspots={store.hotspots}
                  interaction={store.interaction}
                  stageWidth={stageSize.width}
                  stageHeight={stageSize.height}
                  onSelect={handleHotspotSelect}
                  disabled={connectionStatus !== "connected"}
                />
                <AvatarLayer
                  avatars={store.avatars}
                  localUserId={localUser.userId}
                  localUserLabel={copy.youLabel}
                  bubbles={store.bubbles}
                  onDismissBubble={dismissSpeechBubble}
                  dismissBubbleLabel={copy.dismissRoomMessage}
                  partnerJustJoined={partnerJustJoined && connectionStatus === "connected"}
                  motionPolicy={motionPolicy}
                />
              </Pressable>
            )}
          </Animated.View>
        </View>
      </BlurTargetView>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <StableMiniRoomHud
          partnerFirstName={partnerFirstName}
          connectionStatus={connectionStatus}
          voiceAvailable={voiceAvailable}
          localMedia={localMedia}
          copy={copy}
          leaveDisabled={leaveDisabled}
          horizontalInset={presentation.chromeHorizontalInset}
          gap={presentation.chromeGap}
          topInset={safeAreaInsets.top}
          blurTarget={blurTargetRef}
          onLeave={onLeave}
          onOpenSafety={onOpenSafety}
          onRetryConnect={onRetryConnect}
          onToggleMic={onToggleMic}
        />
      </View>

      <View style={styles.keyboardFlex} pointerEvents="none" />
      <SafeAreaView contentGutter={false} edges={["bottom"]} style={styles.composerSafeArea}>
        <RoomChatComposer
          value={composerText}
          copy={copy}
          onChangeText={handleComposerChange}
          onSubmit={handleSubmitComposer}
          disabled={composerDisabled}
          blurTarget={blurTargetRef}
          horizontalInset={presentation.composerHorizontalInset}
          verticalInset={presentation.composerVerticalInset}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

interface RoomChatComposerProps {
  copy: MiniRoomCopy
  value: string
  disabled: boolean
  blurTarget: RefObject<View | null>
  horizontalInset: number
  verticalInset: number
  onChangeText: (value: string) => void
  onSubmit: () => void
}

const RoomChatComposer = memo(function RoomChatComposer(props: RoomChatComposerProps) {
  const {
    copy,
    value,
    disabled,
    blurTarget,
    horizontalInset,
    verticalInset,
    onChangeText,
    onSubmit
  } = props
  return (
    <View
      style={[
        styles.composerWrap,
        {
          paddingHorizontal: horizontalInset,
          paddingVertical: verticalInset
        }
      ]}
    >
      <View style={styles.composerBar}>
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={72}
          tint="systemUltraThinMaterialLight"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.composerGlassTint} />
        <View pointerEvents="none" style={styles.composerHighlight} />
        <TextInput
          accessibilityLabel={copy.roomMessage}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={copy.roomMessagePlaceholder}
          placeholderTextColor="rgba(76, 53, 72, 0.52)"
          maxLength={140}
          returnKeyType="send"
          blurOnSubmit
          style={styles.composerInput}
          editable={!disabled}
          keyboardAppearance="light"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.sendRoomMessage}
          accessibilityState={{ disabled: disabled || value.trim().length === 0 }}
          disabled={disabled || value.trim().length === 0}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.composerSend,
            (disabled || value.trim().length === 0) ? styles.composerSendDisabled : null,
            pressed ? styles.composerSendPressed : null
          ]}
        >
          <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  )
})

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
  root: {
    flex: 1,
    backgroundColor: ROOM_V2_OUTSIDE_COLOR
  },
  blurTarget: {
    ...StyleSheet.absoluteFill,
    backgroundColor: ROOM_V2_OUTSIDE_COLOR
  },
  roomWrap: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    alignItems: "center"
  },
  roomStageFrame: {
    ...StyleSheet.absoluteFill,
    alignItems: "center"
  },
  roomWorldCamera: {
    position: "absolute",
    alignSelf: "center",
    overflow: "visible"
  },
  legacyRoomStage: {
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
  composerSafeArea: {
    backgroundColor: "transparent",
    zIndex: 20
  },
  keyboardFlex: {
    flex: 1
  },
  composerWrap: {
    alignItems: "stretch"
  },
  composerBar: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 20,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    shadowColor: "#D8B7E8",
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8
  },
  composerGlassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 247, 252, 0.76)"
  },
  composerHighlight: {
    position: "absolute",
    top: 1,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.94)"
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 80,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodySmall,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600"
  },
  composerSend: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primary,
  },
  composerSendDisabled: {
    opacity: 0.35,
  },
  composerSendPressed: {
    transform: [{ scale: 0.92 }],
  },
})
