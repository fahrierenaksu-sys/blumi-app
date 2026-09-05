import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const read = (path) => readFileSync(resolve(path), "utf8")

test("Shop displays the result of the current avatar save attempt", () => {
  const provider = read("apps/mobile/src/features/avatarV2/state/AvatarV2Provider.tsx")
  const shop = read("apps/mobile/src/screens/CosmeticShopScreen.tsx")
  const purchase = read("apps/mobile/src/features/shop/shopPurchaseCoordinator.ts")

  assert.match(provider, /runAvatarEquipSave\(\{[\s\S]*?nextAvatar,[\s\S]*?save: \(avatarToSave\) => onSaveAvatar/)
  assert.match(provider, /beginAvatarEquipSave\(avatarEquipLifecycleRef\.current\)/)
  assert.match(provider, /mayCommitAvatarEquipSave\([\s\S]*?avatarEquipLifecycleRef\.current,[\s\S]*?requestGeneration/)
  assert.match(provider, /hasLocalCustomizationRef\.current = markAvatarLocallyCustomized\(\)[\s\S]*?setAvatar\(nextAvatar\)/)
  assert.match(purchase, /const equipResult = await input\.equipAndSaveItem/)
  assert.match(purchase, /title: equipResult\.errorMessage/)
  assert.doesNotMatch(purchase, /title: avatarV2\.saveErrorMessage/)
})

test("scene and snapshot resets cancel the active movement loop first", () => {
  const store = read("apps/mobile/src/features/miniRoom/scene/miniRoomSceneStore.ts")

  assert.match(
    store,
    /useEffect\(\(\) => \{\s*cancelActiveMiniRoomMovement\(animationFrameRef, cancelAnimationFrame\)[\s\S]*?cancelPendingMiniRoomMovementCompletion\([\s\S]*?const nextAvatars = createInitialAvatars/
  )
  assert.match(
    store,
    /cancelActiveMiniRoomMovement\(animationFrameRef, cancelAnimationFrame\)/
  )
  assert.match(store, /scheduleMiniRoomMovementCompletion\(/)
})

test("reduced-motion policy is wired to decorative avatar motion", () => {
  const layer = read("apps/mobile/src/features/miniRoom/scene/AvatarLayer.tsx")

  for (const field of [
    "animateBreathe",
    "animateJoin",
    "animateSpeaking",
    "animateEmote",
    "animateBubble"
  ]) {
    assert.match(layer, new RegExp(`motionPolicy\\.${field}`))
  }
  assert.match(layer, /emotePopRef\.setValue\(1\)/)
  assert.match(layer, /joinPulseRef\.setValue\(1\)/)
})

test("room entry and together-heart motion respect the same accessibility policy", () => {
  const scene = read("apps/mobile/src/features/miniRoom/scene/MiniRoomScene.tsx")

  assert.match(scene, /resolveMiniRoomMotionPolicy\(reduceMotion\)/)
  assert.match(scene, /!motionPolicy\.animateJoin/)
  assert.match(scene, /!motionPolicy\.animateHeart/)
  assert.match(scene, /duration: motionPolicy\.transitionDuration/)
})
