/**
 * The 2.5D room furniture (all User approved 2026-10-10, F14). Each id is canonical: Shop, purchase, inventory,
 * room, MiniRoom and remote participants use it unchanged, and it is never renamed or reused. Until the economy
 * proposal sets their prices they sit in the release catalog's `pricing-pending` hold, so nobody can buy them and
 * the Shop never lists them.
 */
export const ROOM_V3_FURNITURE: readonly { readonly itemId: string; readonly title: string }[] = Object.freeze([
  { itemId: "room_v3_sofa_japon_cream", title: "Japon Cream Sofa" },
  { itemId: "room_v3_armchair_japon_cream", title: "Japon Cream Armchair" },
  { itemId: "room_v3_bed_japon_sakura", title: "Japon Sakura Bed" },
  { itemId: "room_v3_coffeetable_japon_round", title: "Japon Round Coffee Table" },
  { itemId: "room_v3_nightstand_japon_cedar", title: "Japon Cedar Nightstand" },
  { itemId: "room_v3_bookshelf_japon_rattan", title: "Japon Rattan Bookshelf" },
  { itemId: "room_v3_clothesrack_japon_bamboo", title: "Japon Bamboo Clothes Rack" },
  { itemId: "room_v3_rug_japon_botanic", title: "Japon Botanic Rug" },
  { itemId: "room_v3_rug_japon_tea", title: "Japon Tea Rug" },
  { itemId: "room_v3_teaset_japon_zaisu", title: "Japon Zaisu Tea Set" },
  { itemId: "room_v3_tvunit_japon_rattan", title: "Japon Rattan TV Unit" },
  { itemId: "room_v3_frame_japon_sakura", title: "Japon Sakura Frame" },
  { itemId: "room_v3_clock_japon_flower", title: "Japon Flower Clock" },
  { itemId: "room_v3_bed_oyun_gingham", title: "Oyun Gingham Bed" },
  { itemId: "room_v3_bookshelf_oyun_cream", title: "Oyun Cream Bookshelf" },
  { itemId: "room_v3_dresser_oyun_honey", title: "Oyun Honey Dresser" },
  { itemId: "room_v3_nightstand_oyun_honey", title: "Oyun Honey Nightstand" },
  { itemId: "room_v3_snacktable_oyun_round", title: "Oyun Round Snack Table" },
  { itemId: "room_v3_teaset_oyun_flower", title: "Oyun Flower Tea Set" },
  { itemId: "room_v3_tvunit_oyun_game", title: "Oyun Game TV Unit" },
  { itemId: "room_v3_pouf_oyun_bunnypink", title: "Oyun Bunny Pouf" },
  { itemId: "room_v3_pouf_oyun_bearpurple", title: "Oyun Bear Pouf" },
  { itemId: "room_v3_rug_oyun_checker", title: "Oyun Checker Rug" },
  { itemId: "room_v3_rug_oyun_cloud", title: "Oyun Cloud Rug" },
  { itemId: "room_v3_rug_oyun_tea", title: "Oyun Tea Rug" },
  { itemId: "room_v3_poster_oyun_bunny", title: "Oyun Bunny Poster" },
  { itemId: "room_v3_poster_oyun_controller", title: "Oyun Controller Poster" }
])

/** The free starter bed (F9): every account owns it, the default room holds only it; never sold, never held. */
export const STARTER_ROOM_BED_ID = "room_v3_bed_blumi_starter"
export const STARTER_ROOM_BED_TITLE = "Blumi Starter Bed"

/**
 * Ids reserved for items whose art is not in the app yet: no economy entry, nobody owns them, every request for
 * them is refused as unknown. Empty since the starter bed's art landed (it became `ownedByDefault` then, F9).
 */
export const RESERVED_ROOM_ITEM_IDS: readonly string[] = Object.freeze([])

/** Placeholder price of a held piece until the economy proposal (plan §12) sets it; never sold while held. */
export const PRICING_PENDING_PLACEHOLDER_COINS = 0
