import Ionicons from "@expo/vector-icons/Ionicons"
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
  View
} from "react-native"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { InRoomChatMessageEvent } from "../useInRoomChat"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
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
    width: ROOM_STAGE_SIZE,
    height: ROOM_STAGE_SIZE
  })
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.moveAvatar}
            accessibilityHint={copy.moveAvatarHint}
            style={styles.roomStage}
            onLayout={handleStageLayout}
            onPress={handleRoomPress}
          >
            {roomDecorScene?.shell ? (
              <StableMiniRoomRoomDecorLayer
                scene={roomDecorScene}
                interaction={store.interaction}
              />
            ) : (
              <StableRoomMapLayer scene={store.scene} interaction={store.interaction} />
            )}
            <StableHotspotLayer
              hotspots={store.hotspots}
              interaction={store.interaction}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
              onSelect={handleHotspotSelect}
              disabled={connectionStatus !== "connected"}
            />
            <TogetherHeartOverlay
              active={closeTogether}
              motionPolicy={motionPolicy}
            />
            <AvatarLayer
              avatars={store.avatars}
              localUserId={localUser.userId}
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
        </Animated.View>
      </View>

      <SafeAreaView
        contentGutter={false}
        edges={["top", "left", "right"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <StableMiniRoomHud
          connectionStatus={connectionStatus}
          localMedia={localMedia}
          copy={copy}
          leaveDisabled={leaveDisabled}
          onLeave={onLeave}
          onOpenSafety={onOpenSafety}
          onRetryConnect={onRetryConnect}
          onToggleMic={onToggleMic}
        />
      </SafeAreaView>

      <SafeAreaView contentGutter={false} edges={["bottom"]} style={styles.composerSafeArea}>
        <RoomChatComposer
          value={composerText}
          copy={copy}
          onChangeText={handleComposerChange}
          onSubmit={handleSubmitComposer}
          disabled={composerDisabled}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

interface RoomChatComposerProps {
  copy: MiniRoomCopy
  value: string
  disabled: boolean
  onChangeText: (value: string) => void
  onSubmit: () => void
}

const RoomChatComposer = memo(function RoomChatComposer(props: RoomChatComposerProps) {
  const { copy, value, disabled, onChangeText, onSubmit } = props
  return (
    <View style={styles.composerWrap}>
      <View style={styles.composerBar}>
        <TextInput
          accessibilityLabel={copy.roomMessage}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={copy.roomMessagePlaceholder}
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          maxLength={140}
          returnKeyType="send"
          blurOnSubmit
          style={styles.composerInput}
          editable={!disabled}
          keyboardAppearance="dark"
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
          <Text style={styles.composerSendText}>↑</Text>
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
            name="heart"
            size={23}
            color={uiTheme.colors.primary}
          />
      </Animated.View>
    </View>
  )
})

const ROOM_STAGE_SIZE = 390

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1E0F1E",
  },
  roomWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingTop: 40,
    paddingBottom: 40,
  },
  roomStageFrame: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1,
  },
  roomStage: {
    flex: 1,
    borderRadius: 40,
    overflow: "hidden",
    backgroundColor: "#F8ECF2",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#FF8EBE",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  /* ── Welcome Ribbon ────────────── */
  welcomeRibbon: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(20, 8, 18, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 180, 210, 0.35)",
  },
  welcomeText: {
    ...uiTheme.font.micro,
    color: "#FFE4F0",
    letterSpacing: 0.4,
  },
  /* ── Together Heart ────────────── */
  togetherWrap: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  togetherInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255, 100, 160, 0.6)",
    shadowColor: "#FF6AA1",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  composerSafeArea: {
    backgroundColor: "transparent",
  },
  composerWrap: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.md,
    alignItems: "stretch",
    gap: 12,
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 80,
    color: "#FFFFFF",
    ...uiTheme.font.bodySmall,
    fontWeight: "500",
  },
  composerSend: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
  composerSendText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
})
