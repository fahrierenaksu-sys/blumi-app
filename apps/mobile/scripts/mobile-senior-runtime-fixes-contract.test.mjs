import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8")

test("Shop displays the result of the current avatar save attempt", () => {
  const provider = read("apps/mobile/src/features/avatarV2/state/AvatarV2Provider.tsx")
  const shop = read("apps/mobile/src/screens/CosmeticShopScreen.tsx")
  const purchase = read("apps/mobile/src/features/shop/shopPurchaseCoordinator.ts")

  assert.match(provider, /runAvatarEquipSave\(\{[\s\S]*?nextAvatar,[\s\S]*?save: \(avatarToSave\) => onSaveAvatar/)
  assert.match(provider, /beginAvatarEquipSave\(avatarEquipLifecycleRef\.current\)/)
  assert.match(provider, /mayCommitAvatarEquipSave\([\s\S]*?avatarEquipLifecycleRef\.current,[\s\S]*?requestGeneration/)
  assert.match(provider, /hasLocalCustomizationRef\.current = markAvatarLocallyCustomized\(\)[\s\S]*?updateAvatar\(nextAvatar\)/)
  assert.match(purchase, /const equipResult = await input\.equipAndSaveItem/)
  assert.match(purchase, /title: equipResult\.errorMessage/)
  assert.doesNotMatch(purchase, /title: avatarV2\.saveErrorMessage/)
})

test("scene and snapshot resets cancel the active movement loop first", () => {
  const store = read("apps/mobile/src/features/miniRoom/scene/miniRoomSceneStore.ts")

  assert.match(
    store,
    /useEffect\(\(\) => \{\s*for \(const ref of movementsRef\.current\.values\(\)\) cancelActiveMiniRoomMovement\(ref, cancelMiniRoomMovementRun\)[\s\S]*?cancelPendingMiniRoomMovementCompletion\([\s\S]*?const nextAvatars = createInitialAvatars[\s\S]*?snapMiniRoomAvatarPosition\(/
  )
  assert.match(
    store,
    /for \(const ref of movements\.values\(\)\) cancelActiveMiniRoomMovement\(ref, cancelMiniRoomMovementRun\)/
  )
  assert.match(store, /scheduleMiniRoomMovementCompletion\(/)
})

test("reduced-motion policy is wired to decorative avatar motion", () => {
  const layer = read("apps/mobile/src/features/miniRoom/scene/AvatarLayer.tsx")

  for (const field of [
    "animateBreathe",
    "animateJoin",
    "animateSpeaking",
    "animateBubble"
  ]) {
    assert.match(layer, new RegExp(`motionPolicy\\.${field}`))
  }
  assert.match(layer, /bubblePopRef\.setValue\(1\)/)
  assert.match(layer, /joinPulseRef\.setValue\(1\)/)
})

test("room entry motion respects the accessibility policy", () => {
  const scene = read("apps/mobile/src/features/miniRoom/scene/MiniRoomScene.tsx")

  assert.match(scene, /resolveMiniRoomMotionPolicy\(reduceMotion\)/)
  assert.match(scene, /!motionPolicy\.animateJoin/)
})

test("the retired together-sparkle pill no longer floats over the room (2026-10-01)", () => {
  // Owner report: a large round sparkle bubble pulsed above "Sen" whenever
  // the two avatars stood close. It carried no information or action.
  const scene = read("apps/mobile/src/features/miniRoom/scene/MiniRoomScene.tsx")
  const policy = read("apps/mobile/src/features/miniRoom/scene/miniRoomReducedMotion.ts")
  const types = read("apps/mobile/src/features/miniRoom/scene/miniRoomSceneTypes.ts")

  assert.doesNotMatch(scene, /TogetherHeart|together(Wrap|Inner)|sparkles/)
  assert.doesNotMatch(policy, /animateHeart/)
  assert.doesNotMatch(types, /proximityClose/)
})
