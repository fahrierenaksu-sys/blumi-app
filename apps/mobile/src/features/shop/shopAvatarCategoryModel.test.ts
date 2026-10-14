import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarCatalogItem } from "../avatarV2/avatarV2.types"
import type { ShopCatalogItem } from "./shopCatalog"
import {
  SHOP_AVATAR_CATEGORY_ORDER,
  filterAvatarShopProductsByCategory,
  getAvatarShopCategoryId
} from "./shopAvatarCategoryModel"

const avatarItem = (
  id: string,
  type: AvatarCatalogItem["type"],
  extra: Partial<AvatarCatalogItem> = {}
): AvatarCatalogItem => ({
  id,
  type,
  name: id,
  sortOrder: 0,
  layerOrder: 0,
  assets: {},
  ...extra
})

const product = (avatarItemValue: AvatarCatalogItem): ShopCatalogItem => ({
  id: `avatar:${avatarItemValue.id}`,
  kind: "avatarWearable",
  title: avatarItemValue.name,
  description: "",
  priceCoins: 100,
  owned: false,
  previewType: "avatar",
  actionType: "avatarUnlock",
  sourceItemId: avatarItemValue.id,
  sectionId: "avatar",
  eyebrow: "",
  stateLabel: "",
  actionLabel: "",
  avatarItem: avatarItemValue
})

const regularTop = product(avatarItem("avatar_v2_top_regular", "top"))
const dressTop = product(avatarItem("avatar_v2_top_dress", "top", {
  outfitKey: "dress",
  pairedItemId: "avatar_v2_bottom_dress"
}))
const regularBottom = product(avatarItem("avatar_v2_bottom_regular", "bottom"))
const face = product(avatarItem("avatar_v2_face_soft", "face"))
const eyes = product(avatarItem("avatar_v2_eyes_soft", "eyes"))
const nose = product(avatarItem("avatar_v2_nose_soft", "nose"))
const mouth = product(avatarItem("avatar_v2_mouth_soft", "mouth"))

test("avatar categories never include the featured or owned pseudo-categories", () => {
  assert.ok(!SHOP_AVATAR_CATEGORY_ORDER.includes("featured" as never))
  assert.ok(!SHOP_AVATAR_CATEGORY_ORDER.includes("owned" as never))
})

test("normal Tops excludes atomic outfit tops", () => {
  const result = filterAvatarShopProductsByCategory(
    [regularTop, dressTop],
    "top"
  )

  assert.deepEqual(result.map((item) => item.id), [regularTop.id])
})

test("Dress presents only atomic outfit tops", () => {
  const result = filterAvatarShopProductsByCategory(
    [regularTop, dressTop, regularBottom],
    "dress"
  )

  assert.deepEqual(result.map((item) => item.id), [dressTop.id])
  assert.equal(getAvatarShopCategoryId(dressTop), "dress")
})

test("identity parts and owned state never become Shop categories", () => {
  for (const identityProduct of [face, eyes, nose, mouth]) {
    assert.deepEqual(
      filterAvatarShopProductsByCategory([identityProduct], identityProduct.avatarItem?.type ?? ""),
      []
    )
    assert.equal(getAvatarShopCategoryId(identityProduct), undefined)
  }
  assert.deepEqual(filterAvatarShopProductsByCategory([
    { ...regularTop, owned: true }
  ], "owned"), [])
  assert.equal(getAvatarShopCategoryId(regularTop), "top")
})

// New item kinds (WB integration/slots_2140 DESIGN §9): Elbise holds one-piece dresses too; Gözlük holds eyewear,
// which leaves Aksesuar; an empty category is not offered (the shelf builder counts products per category).
const onePiece = product(avatarItem("avatar_v2_dress_one_piece", "dress"))
const glasses = product(avatarItem("avatar_v2_accessory_round_glasses", "accessory", { accessoryGroup: "eyewear" }))
const bag = product(avatarItem("avatar_v2_accessory_mini_bag", "accessory", { accessoryGroup: "bag" }))

test("one-piece dresses are Dresses, glasses are Glasses and never Accessories", () => {
  const all = [regularTop, dressTop, regularBottom, onePiece, glasses, bag]
  assert.deepEqual(filterAvatarShopProductsByCategory(all, "dress").map((item) => item.id), [dressTop.id, onePiece.id])
  assert.deepEqual(filterAvatarShopProductsByCategory(all, "glasses").map((item) => item.id), [glasses.id])
  assert.deepEqual(filterAvatarShopProductsByCategory(all, "accessory").map((item) => item.id), [bag.id])
  assert.deepEqual(filterAvatarShopProductsByCategory(all, "top").map((item) => item.id), [regularTop.id])
  assert.equal(getAvatarShopCategoryId(onePiece), "dress")
  assert.equal(getAvatarShopCategoryId(glasses), "glasses")
  assert.equal(getAvatarShopCategoryId(bag), "accessory")
  for (const item of all) {
    const id = getAvatarShopCategoryId(item)
    assert.ok(id && filterAvatarShopProductsByCategory([item], id).length === 1, `${item.id} is listed on its own shelf`)
  }
})
