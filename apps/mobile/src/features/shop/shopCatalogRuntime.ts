export interface ShopCatalogRuntimeInput {
  sessionMode: "demo" | "production"
  isRoomCatalogQaPreview: boolean
  isFullShopCatalogQaPreview: boolean
}

export interface ShopCatalogRuntime {
  requiresServerInventory: boolean
  enforcePublishedCatalog: boolean
}

export function resolveShopCatalogRuntime(
  input: ShopCatalogRuntimeInput
): ShopCatalogRuntime {
  const isProductionSession = input.sessionMode === "production"
  return {
    requiresServerInventory:
      isProductionSession && !input.isRoomCatalogQaPreview,
    enforcePublishedCatalog:
      isProductionSession &&
      !input.isRoomCatalogQaPreview &&
      !input.isFullShopCatalogQaPreview
  }
}
