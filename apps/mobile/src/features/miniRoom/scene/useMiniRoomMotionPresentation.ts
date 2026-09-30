import { useEffect } from "react"
import type { useMiniRoomMotion } from "../useMiniRoomMotion"
import type { MiniRoomStore } from "./miniRoomSceneTypes"

export function useMiniRoomMotionPresentation(motion: ReturnType<typeof useMiniRoomMotion> | undefined,
  store: MiniRoomStore, localUserId: string, partnerUserId: string) {
  const { applyRemoteAvatar, setRemotePresence } = store
  const enabled = motion?.enabled, avatars = motion?.avatars, snap = motion?.snap
  const present = motion?.partnerPresent ?? false
  useEffect(() => {
    if (!enabled) return
    for (const avatar of avatars ?? []) {
      if (avatar.userId !== localUserId || snap) applyRemoteAvatar(avatar, snap)
    }
  }, [applyRemoteAvatar, avatars, enabled, localUserId, snap])
  useEffect(() => {
    if (enabled) setRemotePresence(partnerUserId, present)
  }, [enabled, partnerUserId, present, setRemotePresence])
  return enabled ? present : true
}
