import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./avatarV2.mock") as typeof import("./avatarV2.mock")
const { isAvatarV2ItemEquipped } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")

test("semantic dress top is equipped through dressId while hidden separates stay independent", () => {
  const dress = AVATAR_V2_CATALOG.find(
    (item) => item.type === "top" && Boolean(item.pairedItemId)
  )
  assert.ok(dress)
  const avatar = {
    ...DEFAULT_AVATAR_V2,
    dressId: dress.id
  }

  assert.equal(isAvatarV2ItemEquipped(avatar, dress), true)
  assert.equal(
    isAvatarV2ItemEquipped(
      avatar,
      AVATAR_V2_CATALOG.find((item) => item.id === avatar.topId)!
    ),
    false
  )
})
