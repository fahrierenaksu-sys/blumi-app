import { useEffect, useRef } from "react"
import type { useMiniRoomMotion } from "../useMiniRoomMotion"
import {
  INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR,
  planMiniRoomMotionPresentation
} from "./miniRoomMotionPresentationModel"
import type { MiniRoomStore } from "./miniRoomSceneTypes"

export function useMiniRoomMotionPresentation(motion: ReturnType<typeof useMiniRoomMotion> | undefined,
  store: MiniRoomStore, localUserId: string, partnerUserId: string) {
  const { applyRemoteAvatar, setRemotePresence, sceneEpoch } = store
  const enabled = motion?.enabled, avatars = motion?.avatars, snapKey = motion?.snapKey ?? 0
  const present = motion?.partnerPresent ?? false
  const refusalRevision = motion?.seatRefusal?.revision
  const cursorRef = useRef(INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR)
  useEffect(() => {
    if (!enabled) return
    const plan = planMiniRoomMotionPresentation(cursorRef.current, {
      avatars: avatars ?? [], snapKey, sceneEpoch, localUserId
    })
    cursorRef.current = plan.cursor
    for (const { avatar, snap } of plan.apply) applyRemoteAvatar(avatar, snap)
  }, [applyRemoteAvatar, avatars, enabled, localUserId, sceneEpoch, snapKey])
  // This phone walks its own avatar, so its own records are echoes, except a
  // refused seat claim: the server's answer then moves the avatar beside it.
  const appliedRefusalRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!enabled || refusalRevision === undefined || appliedRefusalRef.current === refusalRevision) return
    appliedRefusalRef.current = refusalRevision
    const own = avatars?.find(avatar => avatar.userId === localUserId && avatar.revision === refusalRevision)
    if (own) applyRemoteAvatar(own)
  }, [applyRemoteAvatar, avatars, enabled, localUserId, refusalRevision])
  // A rebuilt scene starts from fresh avatars, so presence is applied again.
  useEffect(() => {
    if (enabled) setRemotePresence(partnerUserId, present)
  }, [enabled, partnerUserId, present, sceneEpoch, setRemotePresence])
  return enabled ? present : true
}
