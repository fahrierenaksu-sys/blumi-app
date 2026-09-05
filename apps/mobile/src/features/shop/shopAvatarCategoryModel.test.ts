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

test("avatar categories follow the approved catalog order", () => {
  assert.deepEqual(SHOP_AVATAR_CATEGORY_ORDER, [
    "top",
    "bottom",
    "dress",
    "outerwear",
    "shoes",
    "accessory",
    "hair"
  ])
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
