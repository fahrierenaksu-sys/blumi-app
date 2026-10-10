import type { RoomAvatarSeam } from "./roomAvatarSeamContract"

/**
 * The room seam: shared room code calls the 2.5D avatar and the measured room through this one object.
 *
 * It holds plain functions and data only, never an image module or the GPU renderer, so pure room modules and
 * their Node tests can import it. The app fills it once at start-up (`roomAvatarSeamInstall.ts`, the first import
 * of `App.tsx`) with the rigs, the calibration and the layered furniture art. Until then, and in plain Node tests
 * that do not install it, it draws nothing new: no calibration, no layered pieces, no 2.5D spec.
 */
const NOT_INSTALLED: RoomAvatarSeam = Object.freeze<RoomAvatarSeam>({
  enabled: false,
  resolveRoomAvatar25d: () => null,
  movementTiming: (base) => base,
  roomCalibration: null,
  furnitureCatalog: Object.freeze([])
})

export const roomAvatar25d: RoomAvatarSeam = { ...NOT_INSTALLED }

/** Fills the seam (app start-up, or a test with its own fixtures). Returns a function that puts it back. */
export function installRoomAvatarSeam(seam: RoomAvatarSeam): () => void {
  const previous = { ...roomAvatar25d }
  Object.assign(roomAvatar25d, seam)
  return () => {
    Object.assign(roomAvatar25d, previous)
  }
}
