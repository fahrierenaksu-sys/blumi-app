import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const bottomAssets = [
  {
    avatarId: "avatar_v2_bottom_striped_crochet_shorts",
    roomId: "room_avatar_bottom_female_striped_crochet_shorts_v2",
    fileSlug: "striped_crochet_shorts"
  },
  {
    avatarId: "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
    roomId: "room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2",
    fileSlug: "layered_lace_ruffle_mini_skirt"
  },
  {
    avatarId: "avatar_v2_bottom_black_palm_embellished_pants",
    roomId: "room_avatar_bottom_female_black_palm_embellished_pants_v2",
    fileSlug: "black_palm_embellished_pants"
  },
  {
    avatarId: "avatar_v2_bottom_coral_embellished_laceup_pants",
    roomId: "room_avatar_bottom_female_coral_embellished_laceup_pants_v2",
    fileSlug: "coral_embellished_laceup_pants"
  },
  {
    avatarId: "avatar_v2_bottom_smoky_floral_mesh_pants",
    roomId: "room_avatar_bottom_female_smoky_floral_mesh_pants_v2",
    fileSlug: "smoky_floral_mesh_pants"
  },
  {
    avatarId: "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
    roomId: "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
    fileSlug: "yellow_bow_lace_ruffle_skirt"
  }
]

const workspaceRoot = process.cwd()
const assetRoot = join(
  workspaceRoot,
  "src/features/avatarV2/assets"
)

function readProjectFile(relativePath: string): string {
  return readFileSync(join(workspaceRoot, relativePath), "utf8")
}

test("new bottom wardrobe assets are wired across catalog, room projection, and generated files", () => {
  const avatarCatalog = readProjectFile("src/features/avatarV2/avatarV2.mock.ts")
  const roomCatalog = readProjectFile("src/features/avatarV2/room/avatarRoom.mock.ts")
  const projection = readProjectFile("src/features/avatarV2/room/avatarRoomProjection.ts")
  const shopSource = [
    readProjectFile("src/screens/CosmeticShopScreen.tsx"),
    readProjectFile("src/features/shop/shopAssets.ts")
  ].join("\n")
  const economyCatalog = readProjectFile(
    "../../packages/domain/src/economy/economyCatalog.ts"
  )

  for (const asset of bottomAssets) {
    assert.match(avatarCatalog, new RegExp(`id: "${asset.avatarId}"`), asset.avatarId)
    assert.match(roomCatalog, new RegExp(`id: "${asset.roomId}"`), asset.roomId)
    assert.match(projection, new RegExp(`${asset.avatarId}:[\\s\\S]*bottomId: "${asset.roomId}"`), asset.avatarId)
    assert.match(shopSource, new RegExp(`${asset.avatarId}`), asset.avatarId)
    assert.match(
      economyCatalog,
      new RegExp(`avatarItem\\(\\s*\"${asset.avatarId}\"`),
      asset.avatarId
    )

    assert.equal(
      existsSync(
        join(
          assetRoot,
          `room/avatar_room_bottom_female_${asset.fileSlug}_v2.png`
        )
      ),
      true,
      asset.fileSlug
    )
    assert.equal(
      existsSync(
        join(
          assetRoot,
          `shop-thumbnails/avatar_v2_bottom_${asset.fileSlug}.png`
        )
      ),
      true,
      asset.fileSlug
    )
    for (const suffix of [
      "walking_front_f01",
      "walking_front_f02",
      "walking_front_f03",
      "walking_front_f04",
      "sitting_front_f01"
    ]) {
      assert.equal(
        existsSync(
          join(
            assetRoot,
            `room/motion/room_avatar_bottom_female_${asset.fileSlug}_v2_${suffix}.png`
          )
        ),
        true,
        `${asset.fileSlug} ${suffix}`
      )
    }
  }
})
