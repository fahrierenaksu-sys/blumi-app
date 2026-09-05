import assert from "node:assert/strict"
import test from "node:test"
import { resolveShopSelectedProduct } from "./shopSelectionModel"

const maleTop = { id: "avatar:male-top", sectionId: "avatar" as const }
const maleShoes = { id: "avatar:male-shoes", sectionId: "avatar" as const }
const chair = { id: "room:chair", sectionId: "room" as const }

test("shop selection exposes only live avatar and room sections", () => {
  assert.equal(
    resolveShopSelectedProduct({
      mode: "avatar",
      selectedId: chair.id,
      filteredProducts: [chair],
      activeProducts: [chair]
    }),
    undefined
  )
})

test("avatar mode selects its first compatible product instead of stale home decor", () => {
  assert.equal(
    resolveShopSelectedProduct({
      mode: "avatar",
      selectedId: chair.id,
      filteredProducts: [maleTop, maleShoes],
      activeProducts: [maleTop, maleShoes]
    }),
    maleTop
  )
})

test("an empty avatar catalog never falls through to a home product", () => {
  assert.equal(
    resolveShopSelectedProduct({
      mode: "avatar",
      selectedId: chair.id,
      filteredProducts: [],
      activeProducts: []
    }),
    undefined
  )
})

test("home mode keeps its own selected room product", () => {
  assert.equal(
    resolveShopSelectedProduct({
      mode: "home",
      selectedId: chair.id,
      filteredProducts: [chair],
      activeProducts: [chair]
    }),
    chair
  )
})
