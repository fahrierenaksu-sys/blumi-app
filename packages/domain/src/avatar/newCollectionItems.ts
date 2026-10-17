/**
 * The new collection (2026-10-15, factory design collection_2140 + dresses v2): 10 girl dresses, 2 girl jackets,
 * 4 glasses (2 girl, 2 boy), 6 girl hairs, 3 girl accessories, 3 girl bottoms, 1 pair of girl boots and 5 girl tops; then 6 boy
 * hairs (2026-10-17, boyhair_1017). Every ID is NEW (no old ID is renamed or reused).
 *
 * Each piece is declared once here. It joins the loadout, economy and mobile catalogs once its art has landed
 * (`NEW_COLLECTION_LANDED_ITEM_IDS`), and until its owner-approved receipt lands the release catalog's held scope
 * `new-collection-art-pending` names it, so it is never sold, listed or granted in any build. The wardrobe shows a
 * piece only when owned or sold, so a landed but held piece stays out of sight. `tools/avatar25d/import_collection_item.py`
 * lands one piece (graft, export, bake, map, mark landed, test); the lead lifts the hold together with the receipt.
 *
 * Prices: the economy v1 lead prices (Workbench economy_2025/LEAD/PRICES.tsv), set by the lead under the owner's
 * delegation of the whole economy (OWNER_DECISIONS 2026-10-16 20:23 and 20:39). 16 of them differ from the earlier
 * owner-seen proposals (economy_0910 PRICES_TR, sheet_2110); the owner can still change any of them on the approval
 * page before the receipts land. `isPriceOwnerApproved` is true only while a piece's price still equals the figure the
 * owner approved for it himself (`OWNER_APPROVED_PRICE_COINS`); a lead-set price is never shown as owner-approved.
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

/**
 * The prices the owner approved one by one: the ten dresses on 2026-10-15 21:35 (sheet_2110) and the other pieces on
 * 2026-10-16 09:09 (export_2320/REPORT.md). The lead set every other figure, and a repricing ends the approval, so a
 * piece is owner-approved only while its price equals the figure here. Never add a row the owner has not approved.
 */
export const OWNER_APPROVED_PRICE_COINS: Readonly<Record<string, number>> = Object.freeze({
  dress_girl_butter_square_puff_mini: 220,
  dress_girl_denim_pinafore_mini: 220,
  dress_girl_sage_shirred_tiered_mini: 220,
  dress_girl_wine_gingham_tie: 360,
  dress_girl_black_corset_flare_mini: 360,
  dress_girl_cream_one_shoulder_mini: 360,
  dress_girl_cream_one_shoulder_tie_midi: 360,
  dress_girl_denim_milkmaid_button_midi: 360,
  dress_girl_black_corset_slit_maxi: 520,
  dress_girl_terracotta_patchwork_halter_bias_maxi: 520,
  jacket_girl_black_crop_blazer: 320,
  jacket_girl_light_denim_crop: 200,
  glasses_girl_gold_round: 150,
  glasses_girl_rose_soft_cateye: 150,
  glasses_boy_black_soft_rect: 80,
  glasses_boy_gunmetal_round: 150,
  hair_girl_bun_wine_bow: 300,
  hair_girl_caramel_braid_crown: 450,
  hair_girl_ink_twin_braids: 300,
  hair_girl_chestnut_butterfly: 300,
  hair_girl_copper_soft_waves: 300,
  hair_girl_ink_french_bob: 150,
  necklace_girl_pearl_drop: 150,
  bag_girl_camel_mini: 250,
  clip_girl_pearl_bar_pair: 80,
})

const isOwnerApprovedPrice = (itemId: string, priceCoins: number): boolean =>
  OWNER_APPROVED_PRICE_COINS[itemId] === priceCoins

const dress = (itemId: string, nameTr: string, sheetNameTr: string, priceCoins: number): NewCollectionItem =>
  ({ itemId, slot: "dress", bodyId: GIRL, nameTr, sheetNameTr, priceCoins, isPriceOwnerApproved: isOwnerApprovedPrice(itemId, priceCoins) })

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
  isPriceOwnerApproved: isOwnerApprovedPrice(itemId, priceCoins),
})

export const NEW_COLLECTION_ITEMS: readonly NewCollectionItem[] = Object.freeze([
  dress("dress_girl_butter_square_puff_mini", "Sarı Balon Kol Elbise", "Sarı Kare Yakalı Balon Kol Mini Elbise", 340),
  dress("dress_girl_denim_pinafore_mini", "Kot Askılı Mini Elbise", "Kot Askılı Mini Elbise", 320),
  dress("dress_girl_sage_shirred_tiered_mini", "Adaçayı Katlı Elbise", "Adaçayı Büzgülü Katlı Mini Elbise", 320),
  dress("dress_girl_wine_gingham_tie", "Şarap Ekose Elbise", "Şarap Rengi Ekose Bağcıklı Elbise", 380),
  dress("dress_girl_black_corset_flare_mini", "Siyah Korse Mini Elbise", "Siyah Korse Kloş Mini Elbise", 360),
  dress("dress_girl_cream_one_shoulder_mini", "Krem Tek Omuz Mini Elbise", "Krem Tek Omuz Mini Elbise", 360),
  dress("dress_girl_black_corset_slit_maxi", "Siyah Korse Maxi Elbise", "Siyah Korse Yırtmaçlı Maxi Elbise", 520),
  dress("dress_girl_terracotta_patchwork_halter_bias_maxi", "Patchwork Maxi Elbise", "Kiremit Patchwork Halter Maxi Elbise", 520),
  dress("dress_girl_cream_one_shoulder_tie_midi", "Krem Tek Omuz Midi Elbise", "Krem Tek Omuz Bağcıklı Midi Elbise", 420),
  dress("dress_girl_denim_milkmaid_button_midi", "Kot Düğmeli Midi Elbise", "Kot Düğmeli Milkmaid Midi Elbise", 420),
  piece("jacket_girl_black_crop_blazer", "top", "Siyah Kısa Blazer", 320),
  piece("jacket_girl_light_denim_crop", "top", "Açık Kot Ceket", 260),
  piece("glasses_girl_gold_round", "accessory", "Altın Yuvarlak", 150, { accessoryGroup: "eyewear" }),
  piece("glasses_girl_rose_soft_cateye", "accessory", "Gül Kurusu Kedi Göz", 150, { accessoryGroup: "eyewear" }),
  piece("glasses_boy_black_soft_rect", "accessory", "Mat Siyah Dikdörtgen", 150, { accessoryGroup: "eyewear", bodyId: BOY }),
  piece("glasses_boy_gunmetal_round", "accessory", "Füme Metal Yuvarlak", 150, { accessoryGroup: "eyewear", bodyId: BOY }),
  piece("hair_girl_bun_wine_bow", "hair", "Fiyonklu Topuz", 320),
  piece("hair_girl_caramel_braid_crown", "hair", "Örgü Taç", 450),
  piece("hair_girl_ink_twin_braids", "hair", "Koyu Çift Örgü", 380),
  piece("hair_girl_chestnut_butterfly", "hair", "Kelebek Katlı", 320),
  piece("hair_girl_copper_soft_waves", "hair", "Bakır Dalgalar", 380),
  piece("hair_girl_ink_french_bob", "hair", "Gece Mavisi Fransız Bob", 260),
  piece("necklace_girl_pearl_drop", "accessory", "İnci Damla Kolye", 150, { accessoryGroup: "neck" }),
  piece("bag_girl_camel_mini", "accessory", "Deve Tüyü Omuz Çantası", 220, { accessoryGroup: "bag" }),
  piece("clip_girl_pearl_bar_pair", "accessory", "İnci Toka İkilisi", 80, { accessoryGroup: "hairClip" }),
  piece("bottom_girl_wine_midi_skirt", "bottom", "Bordo Midi Etek", 220),
  piece("bottom_girl_wide_jeans", "bottom", "Bol Paça Kot", 220),
  piece("bottom_girl_ecru_trousers", "bottom", "Ekru Pantolon", 220),
  piece("shoes_girl_camel_ankle_boots", "shoes", "Deve Tüyü Bot", 200),
  piece("top_girl_camel_vest_tee", "top", "Yelek Tişört", 220),
  piece("top_girl_white_poplin_shirt", "top", "Poplin Gömlek", 220),
  piece("top_girl_rose_pearl_cardigan", "top", "Gül Hırka", 240),
  piece("top_girl_breton_stripe", "top", "Bretan Bluz", 220),
  piece("top_girl_sage_knit_polo", "top", "Triko Polo", 220),
  // the boy's six 2.5D hairs (boyhair_1017): owner-approved prices on the hair tiers (short cut 260, quiff 300, waves 320),
  // published with their receipts on 2026-10-17 (docs/quality/SHOP_CATALOG_PUBLICATION_2026-10-17_BOY_HAIRS.md)
  piece("hair_male_blond_fade", "hair", "Sarı Fade", 260, { bodyId: BOY }),
  piece("hair_male_soft_crop", "hair", "Yumuşak Kısa Kesim", 260, { bodyId: BOY }),
  piece("hair_male_black_side_part", "hair", "Siyah Yan Ayrık", 260, { bodyId: BOY }),
  piece("hair_male_wavy_quiff", "hair", "Dalgalı Quiff", 300, { bodyId: BOY }),
  piece("hair_male_cocoa_quiff", "hair", "Kakao Quiff", 300, { bodyId: BOY }),
  piece("hair_male_chestnut_waves", "hair", "Kestane Dalgalar", 320, { bodyId: BOY }),
].map((item) => Object.freeze(item)))

export const NEW_COLLECTION_ITEM_IDS: readonly string[] = Object.freeze(NEW_COLLECTION_ITEMS.map((item) => item.itemId))

/**
 * The pieces whose QA-passed runtime art is in the app (rig item, stills, AVATAR_ITEM_ART). Only these join the loadout,
 * economy and mobile catalogs, so every catalog ID stays drawable. The import script adds an ID here in the same commit
 * as its art; the release catalog hold stays until the lead lands the owner's receipt.
 */
export const NEW_COLLECTION_LANDED_ITEM_IDS: ReadonlySet<string> = new Set<string>([
  "bag_girl_camel_mini",
  "bottom_girl_ecru_trousers",
  "bottom_girl_wide_jeans",
  "bottom_girl_wine_midi_skirt",
  "clip_girl_pearl_bar_pair",
  "dress_girl_black_corset_flare_mini",
  "dress_girl_black_corset_slit_maxi",
  "dress_girl_butter_square_puff_mini",
  "dress_girl_cream_one_shoulder_mini",
  "dress_girl_cream_one_shoulder_tie_midi",
  "dress_girl_denim_milkmaid_button_midi",
  "dress_girl_denim_pinafore_mini",
  "dress_girl_sage_shirred_tiered_mini",
  "dress_girl_terracotta_patchwork_halter_bias_maxi",
  "dress_girl_wine_gingham_tie",
  "glasses_boy_black_soft_rect",
  "glasses_boy_gunmetal_round",
  "glasses_girl_gold_round",
  "glasses_girl_rose_soft_cateye",
  "hair_girl_bun_wine_bow",
  "hair_girl_caramel_braid_crown",
  "hair_girl_chestnut_butterfly",
  "hair_girl_copper_soft_waves",
  "hair_girl_ink_french_bob",
  "hair_girl_ink_twin_braids",
  "hair_male_black_side_part",
  "hair_male_blond_fade",
  "hair_male_chestnut_waves",
  "hair_male_cocoa_quiff",
  "hair_male_soft_crop",
  "hair_male_wavy_quiff",
  "jacket_girl_black_crop_blazer",
  "jacket_girl_light_denim_crop",
  "necklace_girl_pearl_drop",
  "shoes_girl_camel_ankle_boots",
  "top_girl_breton_stripe",
  "top_girl_camel_vest_tee",
  "top_girl_rose_pearl_cardigan",
  "top_girl_sage_knit_polo",
  "top_girl_white_poplin_shirt",
])

export const LANDED_NEW_COLLECTION_ITEMS: readonly NewCollectionItem[] = Object.freeze(
  NEW_COLLECTION_ITEMS.filter((item) => NEW_COLLECTION_LANDED_ITEM_IDS.has(item.itemId)),
)

/** English fallback title (the catalogs keep an English `name`/`title`; Turkish copy comes from `nameTr`). */
export function newCollectionEnglishTitle(itemId: string): string {
  return itemId
    .replace(/^[a-z]+_(girl|boy|male)_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
