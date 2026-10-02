import { useCallback, useRef } from "react"
import { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateTo, animateToAfter, arrivalClock, useMotion } from "../../ui/motion"
import {
  createMatchArrivalGate,
  MATCH_HEART_LINE_MS,
  matchHeartLine,
  matchHeartPop,
  matchMeetingArrival,
  type MatchMeetingPlan,
  type MatchMeetingSide
} from "./matchMeetingModel"

const reset = () => withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never })

/**
 * Drives one match meeting (see matchMeetingModel) on the UI thread. JS hears
 * only the two arrivals and the contact, never a frame. `start` restarts the
 * whole moment (every value is reassigned, so a running one is interrupted).
 * A chibi has arrived when its slide visibly ends (delay + token duration),
 * timed by its own clock: the slide's spring rests about half as long again
 * later, and the heart line must not wait for that.
 */
export function useMatchMeeting() {
  const motion = useMotion()
  const me = useSharedValue(0)
  const partner = useSharedValue(0)
  const meArrival = useSharedValue(0)
  const partnerArrival = useSharedValue(0)
  const line = useSharedValue(0)
  const heart = useSharedValue(0)
  const lineDrawn = useSharedValue(true)
  const arriveRef = useRef<(side: MatchMeetingSide) => void>(() => undefined)
  const onContactRef = useRef<() => void>(() => undefined)
  const reduceMotion = motion.reduceMotion

  const contact = useCallback(() => {
    heart.value = animateTo(1, motion.bouncy)
    onContactRef.current()
  }, [heart, motion])

  const arrive = useCallback((side: MatchMeetingSide) => {
    arriveRef.current(side)
  }, [])

  const start = useCallback((input: {
    plan: MatchMeetingPlan
    /** Lets the surface settle first (the card's own entrance). */
    delayMs: number
    onContact: () => void
  }) => {
    const { plan, delayMs } = input
    onContactRef.current = input.onContact
    arriveRef.current = createMatchArrivalGate(() => {
      lineDrawn.value = plan.line === "draw"
      line.value = withTiming(
        1,
        {
          duration: plan.line === "draw" ? MATCH_HEART_LINE_MS : motion.crossfade.duration,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never
        },
        (finished) => {
          "worklet"
          if (finished) scheduleOnRN(contact)
        }
      )
    })
    line.value = 0
    heart.value = 0
    const meToken = plan.meArrival === "slide" ? motion.smooth : motion.crossfade
    me.value = withSequence(reset(), animateToAfter(delayMs, 1, meToken))
    meArrival.value = arrivalClock(delayMs, meToken, (finished) => {
      "worklet"
      // An interrupted (restarted) meeting must not arrive in the new one.
      if (finished) scheduleOnRN(arrive, "me")
    })
    if (plan.partnerArrival === "flight") {
      // The FlightTargetView hides the slot until the chibi lands on it.
      cancelAnimation(partnerArrival)
      partner.value = 1
      return
    }
    const partnerToken = plan.partnerArrival === "slide" ? motion.smooth : motion.crossfade
    partner.value = withSequence(reset(), animateToAfter(delayMs, 1, partnerToken))
    partnerArrival.value = arrivalClock(delayMs, partnerToken, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(arrive, "partner")
    })
  }, [arrive, contact, heart, line, lineDrawn, me, meArrival, motion, partner, partnerArrival])

  /** The flown chibi landed (or its flight ended without landing). */
  const partnerArrived = useCallback(() => {
    arrive("partner")
  }, [arrive])

  const meStyle = useAnimatedStyle(() => {
    const arrival = matchMeetingArrival(me.value, "me", reduceMotion)
    return { opacity: arrival.opacity, transform: [{ translateX: arrival.translateX }] }
  })
  const partnerStyle = useAnimatedStyle(() => {
    const arrival = matchMeetingArrival(partner.value, "partner", reduceMotion)
    return { opacity: arrival.opacity, transform: [{ translateX: arrival.translateX }] }
  })
  const lineStyle = useAnimatedStyle(() => {
    const drawn = matchHeartLine(line.value, lineDrawn.value)
    return { opacity: drawn.opacity, transform: [{ scaleX: drawn.scaleX }] }
  })
  const heartStyle = useAnimatedStyle(() => {
    const pop = matchHeartPop(heart.value)
    return { opacity: pop.opacity, transform: [{ scale: pop.scale }] }
  })

  return { start, partnerArrived, meStyle, partnerStyle, lineStyle, heartStyle }
}
