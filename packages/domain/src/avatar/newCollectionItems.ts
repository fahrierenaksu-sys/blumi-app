/**
 * The new collection (2026-10-15, factory design collection_2140 + dresses v2): 10 girl dresses, 2 girl jackets,
 * 4 glasses (2 girl, 2 boy), 6 girl hairs, 3 girl accessories, 3 girl bottoms and 1 pair of girl boots. Every ID is NEW (no old ID is renamed or reused).
 *
 * Each piece is declared once here. It joins the loadout, economy and mobile catalogs once its art has landed
 * (`NEW_COLLECTION_LANDED_ITEM_IDS`), and until its owner-approved receipt lands the release catalog's held scope
 * `new-collection-art-pending` names it, so it is never sold, listed or granted in any build. The wardrobe shows a
 * piece only when owned or sold, so a landed but held piece stays out of sight. `tools/avatar25d/import_collection_item.py`
 * lands one piece (graft, export, bake, map, mark landed, test); the lead lifts the hold together with the receipt.
 *
 * Prices: the dresses carry the owner-approved prices (OWNER_DECISIONS 2026-10-15 21:35, sheet_2110 ONAY.html); the
 * bottoms and boots were approved on 2026-10-16 10:09 (OWNER_DECISIONS), and every other piece at the PRICES_TR
 * proposal (economy_0910, export_2320 REPORT (a)) on 2026-10-16 09:09 (owner: "tamam fiyat da").
 * `nameTr` fits the wardrobe card's two 13-character lines; `sheetNameTr` is the longer name shown on the owner sheet.
 */
export type NewCollectionSlot = "hair" | "top" | "bottom" | "shoes" | "dress" | "accessory"
export type NewCollectionAccessoryGroup = "eyewear" | "neck" | "bag" | "hairClip"

export interface NewCollectionItem {
  readonly itemId: string
  readonly slot: NewCollectionSlot
  readonly accessoryGroup?: NewCollectionAccessoryGroup
  readonly bodyId: "avatar_v2_body_default" | "avatar_v2_body_male_light"
  readonly nameTr: string
  readonly sheetNameTr?: string
  readonly priceCoins: number
  readonly isPriceOwnerApproved: boolean
}

const GIRL = "avatar_v2_body_default" as const
const BOY = "avatar_v2_body_male_light" as const

const dress = (itemId: string, nameTr: string, sheetNameTr: string, priceCoins: number): NewCollectionItem =>
  ({ itemId, slot: "dress", bodyId: GIRL, nameTr, sheetNameTr, priceCoins, isPriceOwnerApproved: true })

const piece = (
  itemId: string,
  slot: NewCollectionSlot,
  nameTr: string,
  priceCoins: number,
  extra: { accessoryGroup?: NewCollectionAccessoryGroup; bodyId?: NewCollectionItem["bodyId"] } = {},
): NewCollectionItem => ({
  itemId,
  slot,
  ...(extra.accessoryGroup ? { accessoryGroup: extra.accessoryGroup } : {}),
  bodyId: extra.bodyId ?? GIRL,
  nameTr,
  priceCoins,
  isPriceOwnerApproved: true,
})

export const NEW_COLLECTION_ITEMS: readonly NewCollectionItem[] = Object.freeze([
  dress("dress_girl_butter_square_puff_mini", "Sarı Balon Kol Elbise", "Sarı Kare Yakalı Balon Kol Mini Elbise", 220),
  dress("dress_girl_denim_pinafore_mini", "Kot Askılı Mini Elbise", "Kot Askılı Mini Elbise", 220),
  dress("dress_girl_sage_shirred_tiered_mini", "Adaçayı Katlı Elbise", "Adaçayı Büzgülü Katlı Mini Elbise", 220),
  dress("dress_girl_wine_gingham_tie", "Şarap Ekose Elbise", "Şarap Rengi Ekose Bağcıklı Elbise", 360),
  dress("dress_girl_black_corset_flare_mini", "Siyah Korse Mini Elbise", "Siyah Korse Kloş Mini Elbise", 360),
  dress("dress_girl_cream_one_shoulder_mini", "Krem Tek Omuz Mini Elbise", "Krem Tek Omuz Mini Elbise", 360),
  dress("dress_girl_black_corset_slit_maxi", "Siyah Korse Maxi Elbise", "Siyah Korse Yırtmaçlı Maxi Elbise", 520),
  dress("dress_girl_terracotta_patchwork_halter_bias_maxi", "Patchwork Maxi Elbise", "Kiremit Patchwork Halter Maxi Elbise", 520),
  dress("dress_girl_cream_one_shoulder_tie_midi", "Krem Tek Omuz Midi Elbise", "Krem Tek Omuz Bağcıklı Midi Elbise", 360),
  dress("dress_girl_denim_milkmaid_button_midi", "Kot Düğmeli Midi Elbise", "Kot Düğmeli Milkmaid Midi Elbise", 360),
  piece("jacket_girl_black_crop_blazer", "top", "Siyah Kısa Blazer", 320),
  piece("jacket_girl_light_denim_crop", "top", "Açık Kot Ceket", 200),
  piece("glasses_girl_gold_round", "accessory", "Altın Yuvarlak", 150, { accessoryGroup: "eyewear" }),
  piece("glasses_girl_rose_soft_cateye", "accessory", "Gül Kurusu Kedi Göz", 150, { accessoryGroup: "eyewear" }),
  piece("glasses_boy_black_soft_rect", "accessory", "Mat Siyah Dikdörtgen", 80, { accessoryGroup: "eyewear", bodyId: BOY }),
  piece("glasses_boy_gunmetal_round", "accessory", "Füme Metal Yuvarlak", 150, { accessoryGroup: "eyewear", bodyId: BOY }),
  piece("hair_girl_bun_wine_bow", "hair", "Fiyonklu Topuz", 300),
  piece("hair_girl_caramel_braid_crown", "hair", "Örgü Taç", 450),
  piece("hair_girl_ink_twin_braids", "hair", "Koyu Çift Örgü", 300),
  piece("hair_girl_chestnut_butterfly", "hair", "Kelebek Katlı", 300),
  piece("hair_girl_copper_soft_waves", "hair", "Bakır Dalgalar", 300),
  piece("hair_girl_ink_french_bob", "hair", "Gece Mavisi Fransız Bob", 150),
  piece("necklace_girl_pearl_drop", "accessory", "İnci Damla Kolye", 150, { accessoryGroup: "neck" }),
  piece("bag_girl_camel_mini", "accessory", "Deve Tüyü Omuz Çantası", 250, { accessoryGroup: "bag" }),
  piece("clip_girl_pearl_bar_pair", "accessory", "İnci Toka İkilisi", 80, { accessoryGroup: "hairClip" }),
  piece("bottom_girl_wine_midi_skirt", "bottom", "Bordo Midi Etek", 220),
  piece("bottom_girl_wide_jeans", "bottom", "Bol Paça Kot", 220),
  piece("bottom_girl_ecru_trousers", "bottom", "Ekru Pantolon", 220),
  piece("shoes_girl_camel_ankle_boots", "shoes", "Deve Tüyü Bot", 180),
].map((item) => Object.freeze(item)))

export const NEW_COLLECTION_ITEM_IDS: readonly string[] = Object.freeze(NEW_COLLECTION_ITEMS.map((item) => item.itemId))

/**
 * The pieces whose QA-passed runtime art is in the app (rig item, stills, AVATAR_ITEM_ART). Only these join the loadout,
 * economy and mobile catalogs, so every catalog ID stays drawable. The import script adds an ID here in the same commit
 * as its art; the release catalog hold stays until the lead lands the owner's receipt.
 */
export const NEW_COLLECTION_LANDED_ITEM_IDS: ReadonlySet<string> = new Set<string>([
  "jacket_girl_black_crop_blazer",
  "jacket_girl_light_denim_crop",
])

export const LANDED_NEW_COLLECTION_ITEMS: readonly NewCollectionItem[] = Object.freeze(
  NEW_COLLECTION_ITEMS.filter((item) => NEW_COLLECTION_LANDED_ITEM_IDS.has(item.itemId)),
)

/** English fallback title (the catalogs keep an English `name`/`title`; Turkish copy comes from `nameTr`). */
export function newCollectionEnglishTitle(itemId: string): string {
  return itemId
    .replace(/^[a-z]+_(girl|boy)_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
