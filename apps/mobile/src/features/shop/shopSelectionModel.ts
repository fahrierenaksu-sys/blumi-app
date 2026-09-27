export type ShopSelectionMode = "avatar" | "home"

export interface ShopSelectableProduct {
  id: string
  sectionId: "avatar" | "room"
}

export function resolveShopSelectedProduct<T extends ShopSelectableProduct>(
  input: {
    mode: ShopSelectionMode
    selectedId: string
    filteredProducts: readonly T[]
    activeProducts: readonly T[]
  }
): T | undefined {
  const expectedSection = input.mode === "avatar" ? "avatar" : "room"
  const availableProducts = input.activeProducts.filter(
    (product) => product.sectionId === expectedSection
  )
  return availableProducts.find((product) => product.id === input.selectedId)
}
