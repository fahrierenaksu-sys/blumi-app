import { useCallback, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Reanimated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/animations"
import { uiTheme } from "../../ui/theme"
import { CAT_TRIP_COPY, getCatSouvenirCopy } from "./catTripCopy"
import type { CatReveal } from "./catTripModel"
import { CatSprite } from "./CatSprite"
import type { CatCounterpart } from "./useCatTrips"

const SPRITE_SIZE = 132
const ENTER_MS = 450
const CARD_MS = 550

type Stage =
  | { kind: "mystery" }
  | { kind: "opening" }
  | { kind: "revealed"; counterpart: CatCounterpart | null }

/**
 * The next-day first screen of the traveling cat, over the real My Room.
 * Owner: a clue (the keepsake it brought back) and a guess, then the card
 * turns and names the home it slept in. Host: a sleeping guest cat; a tap
 * flips its collar tag. Names come only from the ack, never from a push.
 * Nothing blocks: "Sonra" closes at once and hides it for the day.
 */
export function CatTripRevealOverlay(props: {
  reveal: CatReveal
  onAcknowledge: (tripId: string) => Promise<CatCounterpart | null>
  onDismiss: (tripId: string) => void
  onOpenChat: (threadId: string) => void
  testID?: string
}) {
  const { reveal, onAcknowledge, onDismiss, onOpenChat, testID = "cat-trip-reveal" } = props
  const reduceMotion = useReducedMotion()
  const tripId = reveal.role === "owner" ? reveal.trip.tripId : reveal.guest.tripId
  const [stage, setStage] = useState<Stage>({ kind: "mystery" })
  const [failed, setFailed] = useState(false)

  const open = useCallback(async () => {
    if (stage.kind !== "mystery") return
    setStage({ kind: "opening" })
    setFailed(false)
    try {
      const counterpart = await onAcknowledge(tripId)
      setStage({ kind: "revealed", counterpart })
    } catch {
      setFailed(true)
      setStage({ kind: "mystery" })
    }
  }, [onAcknowledge, stage.kind, tripId])

  const close = useCallback(() => onDismiss(tripId), [onDismiss, tripId])
  const entering = reduceMotion ? undefined : FadeInDown.duration(ENTER_MS)
  const cardEntering = reduceMotion ? FadeIn.duration(200) : FadeIn.duration(CARD_MS)
  const revealed = stage.kind === "revealed" ? stage.counterpart : undefined
  const counterpartName = revealed?.name ?? null
  const threadId = revealed?.threadId ?? null

  return (
    <Reanimated.View
      testID={testID}
      style={styles.scrim}
      entering={reduceMotion ? undefined : FadeIn.duration(220)}
      exiting={reduceMotion ? undefined : FadeOut.duration(140)}
    >
      <Pressable style={styles.skip} onPress={close} accessibilityRole="button" testID={`${testID}-later`}>
        <Text style={styles.skipLabel}>{CAT_TRIP_COPY.later}</Text>
      </Pressable>
      <Reanimated.View style={styles.sheet} entering={entering} accessibilityLiveRegion="polite">
        {reveal.role === "owner" ? (
          stage.kind === "revealed" ? (
            <Reanimated.View key="owner-revealed" entering={cardEntering} style={styles.card}>
              <CatSprite clip="sleep" size={SPRITE_SIZE} testID={`${testID}-cat`} />
              <Text style={styles.title}>{CAT_TRIP_COPY.ownerRevealTitle(counterpartName, reveal.trip.kind)}</Text>
              <Text style={styles.body}>{CAT_TRIP_COPY.ownerRevealBody}</Text>
            </Reanimated.View>
          ) : (
            <View key="owner-clue" style={styles.card}>
              <Text style={styles.title}>{CAT_TRIP_COPY.ownerClueTitle(reveal.trip.kind)}</Text>
              {reveal.trip.souvenir ? (
                <View style={styles.clue}>
                  <Text style={styles.clueGlyph}>{getCatSouvenirCopy(reveal.trip.souvenir.key).glyph}</Text>
                  <Text style={styles.body}>{CAT_TRIP_COPY.ownerClueBody(getCatSouvenirCopy(reveal.trip.souvenir.key).label)}</Text>
                </View>
              ) : null}
              {CAT_TRIP_COPY.returnStateLine(reveal.trip.returnState) ? (
                <Text style={styles.body}>{CAT_TRIP_COPY.returnStateLine(reveal.trip.returnState)}</Text>
              ) : null}
              <Text style={styles.question}>{CAT_TRIP_COPY.ownerGuess}</Text>
            </View>
          )
        ) : (
          <View key="host" style={styles.card}>
            <CatSprite
              clip={stage.kind === "revealed" ? "greet" : "sleep"}
              size={SPRITE_SIZE}
              onTap={() => void open()}
              testID={`${testID}-cat`}
            />
            <Text style={styles.title}>{CAT_TRIP_COPY.hostTitle}</Text>
            {stage.kind === "revealed" ? (
              <Reanimated.View entering={cardEntering} style={styles.tag}>
                <Text style={styles.tagLabel}>{CAT_TRIP_COPY.hostTag(counterpartName)}</Text>
              </Reanimated.View>
            ) : (
              <>
                <Text style={styles.body}>{CAT_TRIP_COPY.hostBody}</Text>
                <Text style={styles.hint}>{CAT_TRIP_COPY.hostTapHint}</Text>
              </>
            )}
            <Text style={styles.chip}>{CAT_TRIP_COPY.hostChip}</Text>
          </View>
        )}
        {failed ? <Text style={styles.hint}>{CAT_TRIP_COPY.revealUnavailable}</Text> : null}
        <View style={styles.actions}>
          {stage.kind !== "revealed" && reveal.role === "owner" ? (
            <ActionButton label={CAT_TRIP_COPY.flipCard} primary busy={stage.kind === "opening"} onPress={() => void open()} testID={`${testID}-flip`} />
          ) : null}
          {stage.kind === "revealed" && counterpartName && threadId ? (
            <ActionButton
              label={CAT_TRIP_COPY.writeTo(counterpartName)}
              primary
              onPress={() => { close(); onOpenChat(threadId) }}
              testID={`${testID}-write`}
            />
          ) : null}
          <ActionButton label={CAT_TRIP_COPY.later} onPress={close} testID={`${testID}-close`} />
        </View>
      </Reanimated.View>
    </Reanimated.View>
  )
}

function ActionButton(props: { label: string; primary?: boolean; busy?: boolean; onPress: () => void; testID?: string }) {
  const { label, primary, busy, onPress, testID } = props
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonQuiet, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.buttonLabel, primary ? styles.buttonLabelPrimary : null]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", backgroundColor: "rgba(27, 15, 38, 0.34)" },
  skip: { position: "absolute", top: 16, right: 16, paddingHorizontal: 14, paddingVertical: 8, borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.86)" },
  skipLabel: { color: uiTheme.colors.textPrimary, fontWeight: "600" },
  sheet: { margin: 12, padding: 20, borderRadius: uiTheme.radius.xl, backgroundColor: uiTheme.colors.surfaceRaised, gap: 14 },
  card: { alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: uiTheme.colors.textPrimary, textAlign: "center" },
  body: { fontSize: 15, color: uiTheme.colors.textSecondary, textAlign: "center" },
  question: { fontSize: 16, fontWeight: "600", color: uiTheme.colors.brandPink, textAlign: "center", marginTop: 4 },
  hint: { fontSize: 13, color: uiTheme.colors.textSecondary, textAlign: "center" },
  clue: { alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: uiTheme.radius.lg,
    backgroundColor: uiTheme.colors.surfaceSoft },
  clueGlyph: { fontSize: 34 },
  tag: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: uiTheme.radius.full, backgroundColor: uiTheme.colors.surfaceSoft },
  tagLabel: { fontSize: 15, fontWeight: "700", color: uiTheme.colors.brandPink },
  chip: { fontSize: 12, color: uiTheme.colors.textSecondary },
  actions: { gap: 8 },
  button: { minHeight: 48, borderRadius: uiTheme.radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonPrimary: { backgroundColor: uiTheme.colors.brandPink },
  buttonQuiet: { backgroundColor: uiTheme.colors.surfaceMuted },
  pressed: { opacity: 0.85 },
  buttonLabel: { fontSize: 16, fontWeight: "600", color: uiTheme.colors.textPrimary },
  buttonLabelPrimary: { color: "#FFFFFF" }
})
