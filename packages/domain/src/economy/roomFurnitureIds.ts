/**
 * The 2.5D room furniture (all User approved 2026-10-10, F14). Each id is canonical: Shop, purchase, inventory,
 * room, MiniRoom and remote participants use it unchanged, and it is never renamed or reused. Prices are the economy
 * v1 lead prices (Workbench economy_2025/LEAD/PRICES.tsv; the owner delegated the economy to the lead, OWNER_DECISIONS
 * 2026-10-16 20:23 and 20:39). Until its receipt lands each piece stays in the release catalog's `pricing-pending`
 * hold, so nobody can buy it and the Shop never lists it.
 */
export const ROOM_V3_FURNITURE: readonly {
  readonly itemId: string
  readonly title: string
  readonly priceCoins: number
}[] = Object.freeze([
  { itemId: "room_v3_sofa_japon_cream", title: "Japon Cream Sofa", priceCoins: 480 },
  { itemId: "room_v3_armchair_japon_cream", title: "Japon Cream Armchair", priceCoins: 300 },
  { itemId: "room_v3_bed_japon_sakura", title: "Japon Sakura Bed", priceCoins: 480 },
  { itemId: "room_v3_coffeetable_japon_round", title: "Japon Round Coffee Table", priceCoins: 200 },
  { itemId: "room_v3_nightstand_japon_cedar", title: "Japon Cedar Nightstand", priceCoins: 180 },
  { itemId: "room_v3_bookshelf_japon_rattan", title: "Japon Rattan Bookshelf", priceCoins: 260 },
  { itemId: "room_v3_clothesrack_japon_bamboo", title: "Japon Bamboo Clothes Rack", priceCoins: 260 },
  { itemId: "room_v3_rug_japon_botanic", title: "Japon Botanic Rug", priceCoins: 180 },
  { itemId: "room_v3_rug_japon_tea", title: "Japon Tea Rug", priceCoins: 150 },
  { itemId: "room_v3_teaset_japon_zaisu", title: "Japon Zaisu Tea Set", priceCoins: 160 },
  { itemId: "room_v3_tvunit_japon_rattan", title: "Japon Rattan TV Unit", priceCoins: 300 },
  { itemId: "room_v3_frame_japon_sakura", title: "Japon Sakura Frame", priceCoins: 80 },
  { itemId: "room_v3_clock_japon_flower", title: "Japon Flower Clock", priceCoins: 80 },
  { itemId: "room_v3_bed_oyun_gingham", title: "Oyun Gingham Bed", priceCoins: 480 },
  { itemId: "room_v3_bookshelf_oyun_cream", title: "Oyun Cream Bookshelf", priceCoins: 260 },
  { itemId: "room_v3_dresser_oyun_honey", title: "Oyun Honey Dresser", priceCoins: 300 },
  { itemId: "room_v3_nightstand_oyun_honey", title: "Oyun Honey Nightstand", priceCoins: 180 },
  { itemId: "room_v3_snacktable_oyun_round", title: "Oyun Round Snack Table", priceCoins: 200 },
  { itemId: "room_v3_teaset_oyun_flower", title: "Oyun Flower Tea Set", priceCoins: 260 },
  { itemId: "room_v3_tvunit_oyun_game", title: "Oyun Game TV Unit", priceCoins: 300 },
  { itemId: "room_v3_pouf_oyun_bunnypink", title: "Oyun Bunny Pouf", priceCoins: 120 },
  { itemId: "room_v3_pouf_oyun_bearpurple", title: "Oyun Bear Pouf", priceCoins: 120 },
  { itemId: "room_v3_rug_oyun_checker", title: "Oyun Checker Rug", priceCoins: 180 },
  { itemId: "room_v3_rug_oyun_cloud", title: "Oyun Cloud Rug", priceCoins: 180 },
  { itemId: "room_v3_rug_oyun_tea", title: "Oyun Tea Rug", priceCoins: 120 },
  { itemId: "room_v3_poster_oyun_bunny", title: "Oyun Bunny Poster", priceCoins: 80 },
  { itemId: "room_v3_poster_oyun_controller", title: "Oyun Controller Poster", priceCoins: 80 }
])

/** The free starter bed (F9): every account owns it, the default room holds only it; never sold, never held. */
export const STARTER_ROOM_BED_ID = "room_v3_bed_blumi_starter"
export const STARTER_ROOM_BED_TITLE = "Blumi Starter Bed"

/**
 * Ids reserved for items whose art is not in the app yet: no economy entry, nobody owns them, every request for
 * them is refused as unknown. Empty since the starter bed's art landed (it became `ownedByDefault` then, F9).
 */
export const RESERVED_ROOM_ITEM_IDS: readonly string[] = Object.freeze([])

/** The layered blush chair (room_v2 id kept, legacy art retired): economy v1 lead price; held until its receipt lands. */
export const ROOM_V2_CHAIR_BLUSH_PRICE_COINS = 250
