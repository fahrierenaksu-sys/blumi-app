import assert from "node:assert/strict"
import test from "node:test"
import type { RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import { shouldRerenderRoomAvatarLayer } from "./roomAvatarLayerRenderModel"

const firstSource = 101
const secondSource = 102

function layer(source: number): RoomV2AvatarRenderLayer {
  return {
    id: "top",
    type: "top",
    layerOrder: 20,
    asset: { key: `top-${source}`, source },
    fitProfileId: "blumi_female_room_avatar_v1"
  }
}

test("fresh layer objects with the same image do not reload on position updates", () => {
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: layer(firstSource), frameIndex: 0 }
  ), false)
})

test("equipment and fit changes still update the visible layer", () => {
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: layer(secondSource), frameIndex: 0 }
  ), true)
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: { ...layer(firstSource), fitProfileId: "blumi_male_room_avatar_v1" }, frameIndex: 0 }
  ), true)
})

test("only a changed animation frame reloads an animated image", () => {
  const animated: RoomV2AvatarRenderLayer = {
    ...layer(firstSource),
    animation: {
      frames: [
        { key: "walk-1", source: firstSource },
        { key: "walk-2", source: secondSource }
      ],
      frameDurationMs: 120,
      loop: true
    }
  }
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: animated, frameIndex: 0 },
    { layer: { ...animated }, frameIndex: 1 }
  ), true)
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: animated, frameIndex: 0 },
    { layer: { ...animated }, frameIndex: 2 }
  ), false)
})
