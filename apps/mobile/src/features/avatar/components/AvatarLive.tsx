import { useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet } from "react-native"
import Reanimated, { useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated"
import type { AvatarLiveProps, AvatarRigId } from "../model/avatarRoomContract"
import { avatar25TravelFacing } from "../model/resolveAvatarDraw"
import { Avatar25Canvas, AVATAR25_POSES } from "../renderer/Avatar25Canvas"
import { AVATAR_RIGS, getAvatar25Rig } from "../renderer/avatar25Assets"
import { stepBreathWeight } from "../renderer/avatar25Life"
import { compileMotionStance, motionCyclesForTravel, SIT_CARD_FROM, sitDownWeight } from "../renderer/avatar25Motion"
import { getAvatar25BoxPlacement } from "../renderer/avatar25Placement"
import { seatedHipToSoleShare, seatedLegExtensionPx } from "../renderer/avatar25SeatedLegs"

const POSE_STAND = AVATAR25_POSES.indexOf("stand")
const POSE_SIT = AVATAR25_POSES.indexOf("sit")
const POSE_WAVE = AVATAR25_POSES.indexOf("wave")
/** sitStartMs: no sit-down running / one starts on the next frame. */
const SIT_DOWN_IDLE = -1
const SIT_DOWN_PENDING = -2
/** Getting up: the soles ease from the floor in front of the seat back onto the box's foot line (s). */
const STAND_UP_SECONDS = 0.4
/** The seated drawing's hip-to-sole drop, as a share of the body's height: [front, back] per rig (`sit.feet` − `sit.seat`). */
const HIP_ABOVE_SOLES_BY_RIG = Object.fromEntries(Object.values(AVATAR_RIGS).map(({ id, rig }) =>
  [id, [rig.views.front, rig.views.back].map(seatedHipToSoleShare)])) as Record<AvatarRigId, number[]>
/**
 * The seated drawing's spine column (the centre of its torso band 0.3-1.3 units above the hip) sits this far, as
 * a share of her height, LEFT of the seat point in the unmirrored [front, back] drawing: the lab's sit cards
 * measured 0.233 and 0.013 units at H 3.1 (Workbench qa_composite.py `card_hip_x`). A layered seat's hip point is
 * where her spine goes, so the seated drawing moves over by it (otherwise she leans onto one armrest).
 */
const SEATED_SPINE_LEFT_GIRL = [0.233 / 3.1, 0.013 / 3.1]
/**
 * The boy's: the girl's values moved by the difference between the two rigs' own seated cards, measured the same
 * way on both (torso band 0.3-1.3 units above `sit.seat`, alpha > 40; boy − girl = −0.0121 front, +0.0012 back of
 * the height; Workbench male/phase4/NOTES.md).
 */
const SEATED_SPINE_LEFT_BY_RIG: Record<AvatarRigId, number[]> = {
  female: SEATED_SPINE_LEFT_GIRL,
  male: [SEATED_SPINE_LEFT_GIRL[0]! - 0.0121, SEATED_SPINE_LEFT_GIRL[1]! + 0.0012]
}

/**
 * The room avatar drawn by the 2.5D WebGPU renderer, inside the existing avatar box. The canvas overhangs the
 * box so the larger figure is never clipped; the feet stay on the avatarV2 foot line.
 */
export function AvatarLive(props: AvatarLiveProps) {
  const { spec, live, stageWidthPx, stageHeightPx, boxHeightPx, reduceMotion } = props
  const rigId = spec.rig ?? "female"
  const rig = getAvatar25Rig(rigId).rig
  const hipAboveSoles = HIP_ABOVE_SOLES_BY_RIG[rigId]
  const seatedSpineLeft = SEATED_SPINE_LEFT_BY_RIG[rigId]
  const view = rig.views[spec.view]
  const placement = getAvatar25BoxPlacement(boxHeightPx, rig.motion.charScale, props.calibratedFigureHeightPx)
  // the seat placement was authored on the avatarV2 foot line: a figure standing lower takes that back when seated
  const seatFootLift = placement.footLiftPx
  const pose = useSharedValue(AVATAR25_POSES.indexOf(spec.pose))
  const walkCycles = useSharedValue(0)
  const walkWeight = useSharedValue(0)
  const waveStartMs = useSharedValue(-1)
  // breathing: fades in standing or seated and out walking or waving (the rig's `breath.poses`, over `fadeS`); a
  // rig without `breath` never breathes. Each mounted avatar has its own place in the blink and breath rhythms.
  const breathWeight = useSharedValue(0)
  const breath = rig.views.front.breath
  const breathFadeS = breath?.fadeS ?? 0
  const breathPoses = useMemo(() => AVATAR25_POSES.map((name) => breath?.poses.includes(name) ?? false), [breath])
  const [lifeSeed] = useState(() => Math.random())
  // sitting down with the retargeted walk: the standing drawing bends its knees first, the seated one takes over
  // half way (doll25); without it the seated drawing shows at once, as before
  const sitWeight = useSharedValue(0)
  // My Room's seated drop (see AvatarLiveProps.seatPlacement), taken back as the 2.5D drawing needs it
  const standUpProgress = useSharedValue(1)
  const seatOuterPx = useSharedValue(props.seatPlacement?.outerPx ?? 0)
  const seatOwnPx = useSharedValue(props.seatPlacement?.seatPx ?? 0)
  const approachDx = useSharedValue(props.seatPlacement?.approachPx?.dx ?? 0)
  const approachDy = useSharedValue(props.seatPlacement?.approachPx?.dy ?? 0)
  // a layered seat (seatPlacement.hip): her hip goes on the seat point; kept after getting up, like the seat height
  const hipSeat = useSharedValue(props.seatPlacement?.hip ? 1 : 0)
  const hipView = useSharedValue(props.seatPlacement?.hip?.view === "back" ? 1 : 0)
  const hipMirror = useSharedValue(props.seatPlacement?.hip?.mirror ? 1 : 0)
  const clipBelowHipPx = useSharedValue(props.seatPlacement?.hip?.clipBelowHipPx ?? -1)
  const seatHip = props.seatPlacement?.hip
  // a layered seat: her seated shins lengthen so her soles reach the floor in front of it at her height (the seats
  // were sized for a taller body); the hip stays on the hip point, only the drawing below the knees moves
  const sitLegDropPx = useSharedValue(0)
  const seatLegDropPx = seatHip?.soleDropPx !== undefined
    ? seatedLegExtensionPx({
      soleDropPx: seatHip.soleDropPx,
      figureHeightPx: placement.figureHeightPx,
      frontShare: hipAboveSoles[0]!,
      viewShare: hipAboveSoles[seatHip.view === "back" ? 1 : 0]!
    })
    : undefined
  // the outer motion style flips x for a "left" facing: offsets are drawn in its flipped space
  const outerSignX = props.outerMirrored ? -1 : 1
  useEffect(() => {
    seatOuterPx.value = props.seatPlacement?.outerPx ?? 0
    // the seat's height stays known after getting up (the seat rig is gone then), for the stand-up ease
    if ((props.seatPlacement?.seatPx ?? 0) > 0) {
      seatOwnPx.value = props.seatPlacement?.seatPx ?? 0
      hipSeat.value = seatHip ? 1 : 0
      hipView.value = seatHip?.view === "back" ? 1 : 0
      hipMirror.value = seatHip?.mirror ? 1 : 0
      clipBelowHipPx.value = seatHip?.clipBelowHipPx ?? -1
      sitLegDropPx.value = seatLegDropPx ?? 0
    }
    // the approach spot also stays known after getting up (the box then starts from it)
    const approach = props.seatPlacement?.approachPx
    if (approach) {
      approachDx.value = approach.dx
      approachDy.value = approach.dy
    }
  }, [approachDx, approachDy, clipBelowHipPx, hipMirror, hipSeat, hipView, props.seatPlacement?.approachPx,
    props.seatPlacement?.outerPx, props.seatPlacement?.seatPx, seatHip, seatLegDropPx, seatOuterPx, seatOwnPx, sitLegDropPx])
  const sitStartMs = useSharedValue(SIT_DOWN_IDLE)
  // getting up: My Room walks the box off the cushion; the soles start on the floor in front of it
  const standUpStartMs = useSharedValue(SIT_DOWN_IDLE)
  const bendsToSit = view.motion !== undefined
  const hasSeatPlacement = props.seatPlacement !== undefined
  const previousPose = useRef(spec.pose)
  const canvasMounted = !props.holdCanvas
  // facing is live: both drawings stay resident, so a turn shows on the very next frame (no rebuild)
  const mirrored = spec.mirror !== Boolean(props.outerMirrored)
  const viewIndex = useSharedValue(spec.view === "back" ? 1 : 0)
  const mirror = useSharedValue(mirrored ? 1 : 0)
  const walking = spec.pose === "walk"
  useEffect(() => {
    const sittingDown = spec.pose === "sit" && previousPose.current !== "sit" && bendsToSit
    standUpStartMs.value = spec.pose !== "sit" && previousPose.current === "sit" ? SIT_DOWN_PENDING : SIT_DOWN_IDLE
    previousPose.current = spec.pose
    sitWeight.value = 0
    sitStartMs.value = sittingDown ? SIT_DOWN_PENDING : SIT_DOWN_IDLE
    pose.value = sittingDown ? POSE_STAND : AVATAR25_POSES.indexOf(spec.pose)
    waveStartMs.value = -1
  }, [bendsToSit, pose, sitStartMs, sitWeight, spec.pose, standUpStartMs, waveStartMs])
  // Walking, she faces the way she moves on screen (avatar25TravelFacing, the four drawn diagonals); the room's
  // own facing is a coarse left/right/front/back of the stage-fraction move and picked the wrong diagonal. She
  // keeps that facing when she stops or waves; seated, the seat's facing applies.
  const outerMirrored = Boolean(props.outerMirrored)
  const travelView = useSharedValue(-1)
  const travelMirror = useSharedValue(0)
  const hipFacing = seatHip ? `${seatHip.view}:${seatHip.mirror ? 1 : 0}` : ""
  useEffect(() => {
    if (spec.pose === "sit") travelView.value = -1
    if (spec.pose === "sit" && hipFacing) {
      // a layered seat names the drawing she sits in: she turns to it, then sits
      const [seatView, seatMirror] = hipFacing.split(":")
      viewIndex.value = seatView === "back" ? 1 : 0
      mirror.value = (seatMirror === "1") !== outerMirrored ? 1 : 0
      return
    }
    if (travelView.value >= 0) {
      viewIndex.value = travelView.value
      mirror.value = (travelMirror.value === 1) !== outerMirrored ? 1 : 0
      return
    }
    viewIndex.value = spec.view === "back" ? 1 : 0
    mirror.value = mirrored ? 1 : 0
  }, [hipFacing, mirror, mirrored, outerMirrored, spec.pose, spec.view, travelMirror, travelView, viewIndex])

  // screen px of travel per walk cycle: the painted feet's own travel at this size
  const pxPerSheet = placement.figureHeightPx / view.height
  const cyclePx = view.walk.strideLen * pxPerSheet
  // the retargeted walk: the planted foot's own on-screen travel per cycle keeps it still on the floor
  const stanceFront = useMemo(() => compileMotionStance(rig.views.front), [rig])
  const stanceBack = useMemo(() => compileMotionStance(rig.views.back), [rig])
  const liveX = live?.x
  const liveY = live?.y
  useAnimatedReaction(
    () => liveX && liveY ? { x: liveX.value, y: liveY.value } : null,
    (current, previous) => {
      if (!current || !previous || !walking) return
      const dx = (current.x - previous.x) * stageWidthPx.value
      const dy = (current.y - previous.y) * stageHeightPx.value
      if (dx === 0 && dy === 0) return
      const facing = avatar25TravelFacing(dx, dy)
      if (facing.view >= 0) {
        travelView.value = facing.view
        travelMirror.value = facing.mirror ? 1 : 0
        viewIndex.value = facing.view
        mirror.value = facing.mirror !== outerMirrored ? 1 : 0
      }
      const stance = travelView.value === 1 ? stanceBack : stanceFront
      if (stance) walkCycles.value += motionCyclesForTravel(stance, dx, dy, travelMirror.value === 1, pxPerSheet)
      else if (cyclePx > 0) walkCycles.value += Math.hypot(dx, dy) / cyclePx
    },
    [cyclePx, liveX, liveY, mirror, outerMirrored, pxPerSheet, stageHeightPx, stageWidthPx, stanceBack, stanceFront,
      travelMirror, travelView, viewIndex, walking]
  )
  useFrameCallback((info) => {
    "worklet"
    const dt = (info.timeSincePreviousFrame ?? 16.7) / 1000
    const target = walking ? 1 : 0
    walkWeight.value += (target - walkWeight.value) * Math.min(1, dt * 10)
    const breathNext = stepBreathWeight(breathWeight.value, breathPoses[pose.value] === true, dt, breathFadeS)
    if (breathNext !== breathWeight.value) breathWeight.value = breathNext
    if (pose.value === POSE_WAVE && waveStartMs.value < 0) waveStartMs.value = info.timestamp
    if (sitStartMs.value === SIT_DOWN_PENDING) sitStartMs.value = info.timestamp
    if (standUpStartMs.value === SIT_DOWN_PENDING) standUpStartMs.value = info.timestamp
    if (standUpStartMs.value >= 0) {
      standUpProgress.value = Math.min(1, (info.timestamp - standUpStartMs.value) / 1000 / STAND_UP_SECONDS)
      if (standUpProgress.value >= 1) standUpStartMs.value = SIT_DOWN_IDLE
    }
    if (sitStartMs.value >= 0) {
      const w = sitDownWeight((info.timestamp - sitStartMs.value) / 1000, reduceMotion)
      if (w >= SIT_CARD_FROM) {
        sitStartMs.value = SIT_DOWN_IDLE
        sitWeight.value = 0
        pose.value = POSE_SIT
      } else sitWeight.value = w
    }
  })

  const seatStyle = useAnimatedStyle(() => {
    if (!hasSeatPlacement) return {}
    // My Room drops the box by `outerPx` while seated. The 2.5D seated drawing takes only the seat's own height of
    // that drop (its soles land in front of the seat). With the 2.5D seat path the box stays at the approach spot
    // in front of the seat (`approachPx`: approach minus seat point): the knees bend there, facing the camera,
    // while she moves onto the seat; getting up she steps forward off it onto the same spot.
    const outer = seatOuterPx.value
    // layered seat: the hip is seatOwnPx above the seat point, the soles the drawing's own hip-to-sole drop below it
    const seat = hipSeat.value === 1
      ? hipAboveSoles[hipView.value]! * placement.figureHeightPx - seatOwnPx.value
      : seatOwnPx.value - seatFootLift
    const ax = approachDx.value * outerSignX
    const ay = approachDy.value
    // layered seat, seated drawing only: her spine onto the hip point (screen right = +, in the outer flipped space)
    const spine = hipSeat.value === 1
      ? outerSignX * (hipMirror.value === 1 ? -1 : 1) * seatedSpineLeft[hipView.value]! * placement.figureHeightPx
      : 0
    if (pose.value === POSE_SIT) return { transform: [{ translateX: spine - ax }, { translateY: -(outer - seat) - ay }] }
    if (sitStartMs.value !== SIT_DOWN_IDLE) {
      const t = sitStartMs.value === SIT_DOWN_PENDING ? 0 : Math.min(1, sitWeight.value / SIT_CARD_FROM)
      return { transform: [{ translateX: -ax * t }, { translateY: -outer + (seat - ay) * t }] }
    }
    if (standUpStartMs.value !== SIT_DOWN_IDLE) {
      const p = standUpStartMs.value === SIT_DOWN_PENDING ? 0 : standUpProgress.value
      const k = 1 - p * p * (3 - 2 * p)
      return { transform: [{ translateX: -ax * k }, { translateY: (seat - ay) * k }] }
    }
    return { transform: [{ translateX: 0 }, { translateY: 0 }] }
  })

  // Back views of a layered seat: nothing of her below `clipBelowHipPx` under the hip point (her seated soles are
  // under the seat and would show between its legs). The clip moves with her; the canvas keeps its size.
  const padPx = -Number(placement.overhangStyle.bottom)
  const clipStyle = useAnimatedStyle(() => {
    const clips = pose.value === POSE_SIT && hipSeat.value === 1 && clipBelowHipPx.value >= 0
    const inset = clips
      ? Math.max(0, padPx + hipAboveSoles[hipView.value]! * placement.figureHeightPx - clipBelowHipPx.value)
      : 0
    return { bottom: inset }
  })
  const unclipStyle = useAnimatedStyle(() => {
    const clips = pose.value === POSE_SIT && hipSeat.value === 1 && clipBelowHipPx.value >= 0
    const inset = clips
      ? Math.max(0, padPx + hipAboveSoles[hipView.value]! * placement.figureHeightPx - clipBelowHipPx.value)
      : 0
    return { bottom: -inset }
  })

  const instances = useMemo(() => [{
    key: "room-avatar",
    rig: rigId,
    view: "front" as const,
    mirror: false,
    itemIds: spec.itemIds,
    anchorX: placement.anchorX,
    anchorY: placement.anchorY,
    heightPx: placement.figureHeightPx,
    lifeSeed
  }], [lifeSeed, placement.anchorX, placement.anchorY, placement.figureHeightPx, rigId, spec.itemIds])

  return (
    <Reanimated.View pointerEvents="none" style={[styles.overhang, placement.overhangStyle, seatStyle]}>
      <Reanimated.View style={[styles.clip, clipStyle]}>
        <Reanimated.View style={[styles.unclip, unclipStyle]}>
          {canvasMounted ? <Avatar25Canvas
            instances={instances}
            driver={{ pose, walkCycles, walkWeight, waveStartMs, sitWeight, sitLegDropPx, breathWeight, view: viewIndex, mirror }}
            reduceMotion={reduceMotion}
            onReady={props.onDrawn}
          /> : null}
        </Reanimated.View>
      </Reanimated.View>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  overhang: { position: "absolute" },
  clip: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
  unclip: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }
})
