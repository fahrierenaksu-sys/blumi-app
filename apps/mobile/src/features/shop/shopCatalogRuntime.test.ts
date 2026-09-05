import assert from "node:assert/strict"
import test from "node:test"
import { resolveShopCatalogRuntime } from "./shopCatalogRuntime"

test("production Shop enforces the published catalog by default", () => {
  assert.deepEqual(resolveShopCatalogRuntime({
    sessionMode: "production",
    isRoomCatalogQaPreview: false,
    isFullShopCatalogQaPreview: false
  }), {
    requiresServerInventory: true,
    enforcePublishedCatalog: true
  })
})

test("explicit full Shop QA keeps server inventory but exposes the QA catalog", () => {
  assert.deepEqual(resolveShopCatalogRuntime({
    sessionMode: "production",
    isRoomCatalogQaPreview: false,
    isFullShopCatalogQaPreview: true
  }), {
    requiresServerInventory: true,
    enforcePublishedCatalog: false
  })
})

test("isolated Room QA uses local inventory and never inherits the production filter", () => {
  assert.deepEqual(resolveShopCatalogRuntime({
    sessionMode: "production",
    isRoomCatalogQaPreview: true,
    isFullShopCatalogQaPreview: false
  }), {
    requiresServerInventory: false,
    enforcePublishedCatalog: false
  })
})

test("demo sessions never use production inventory or publication filtering", () => {
  assert.deepEqual(resolveShopCatalogRuntime({
    sessionMode: "demo",
    isRoomCatalogQaPreview: false,
    isFullShopCatalogQaPreview: false
  }), {
    requiresServerInventory: false,
    enforcePublishedCatalog: false
  })
})
