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

test("category changes do not implicitly select or price a different product", () => {
  assert.equal(
    resolveShopSelectedProduct({
      mode: "avatar",
      selectedId: chair.id,
      filteredProducts: [maleTop, maleShoes],
      activeProducts: [maleTop, maleShoes]
    }),
    undefined
  )
})

test("selected avatar remains visible when browsing another category", () => {
  assert.equal(resolveShopSelectedProduct({
    mode: "avatar",
    selectedId: maleTop.id,
    filteredProducts: [maleShoes],
    activeProducts: [maleTop, maleShoes]
  }), maleTop)
})

test("an empty category does not clear a selection still in the live catalog", () => {
  assert.equal(resolveShopSelectedProduct({ mode: "avatar", selectedId: maleTop.id,
    filteredProducts: [], activeProducts: [maleTop] }), maleTop)
})

test("removed products cannot remain selected through stale category data", () => {
  assert.equal(resolveShopSelectedProduct({ mode: "avatar", selectedId: maleTop.id,
    filteredProducts: [maleTop], activeProducts: [] }), undefined)
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
