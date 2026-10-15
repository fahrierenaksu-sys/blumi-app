import type { AppLocale } from "../session/appLocale"

/**
 * Turkish names of the room pieces people can see today (the layered 2.5D furniture and wall pieces). The catalog
 * keeps its English `name` and every ID stays as it is; this is display copy only. Each name fits one or two short
 * lines on an inventory card.
 */
export const FURNITURE_NAMES_TR: Readonly<Record<string, string>> = {
  // Starter and shared
  room_v3_bed_blumi_starter: "Blumi Yatağı",
  room_v2_chair_blush: "Pudra Koltuk",
  // Japon collection
  room_v3_sofa_japon_cream: "Krem Kanepe",
  room_v3_armchair_japon_cream: "Krem Berjer",
  room_v3_bed_japon_sakura: "Sakura Yatak",
  room_v3_coffeetable_japon_round: "Yuvarlak Sehpa",
  room_v3_nightstand_japon_cedar: "Sedir Komodin",
  room_v3_bookshelf_japon_rattan: "Hasır Kitaplık",
  room_v3_clothesrack_japon_bamboo: "Bambu Askılık",
  room_v3_rug_japon_botanic: "Botanik Halı",
  room_v3_rug_japon_tea: "Çay Halısı",
  room_v3_teaset_japon_zaisu: "Zaisu Çay Takımı",
  room_v3_tvunit_japon_rattan: "Hasır TV Ünitesi",
  room_v3_frame_japon_sakura: "Sakura Çerçeve",
  room_v3_clock_japon_flower: "Çiçekli Saat",
  // Oyun Odası collection
  room_v3_bed_oyun_gingham: "Ekose Yatak",
  room_v3_bookshelf_oyun_cream: "Krem Kitaplık",
  room_v3_dresser_oyun_honey: "Bal Şifonyer",
  room_v3_nightstand_oyun_honey: "Bal Komodin",
  room_v3_snacktable_oyun_round: "Atıştırmalık Masası",
  room_v3_teaset_oyun_flower: "Çiçekli Çay Takımı",
  room_v3_tvunit_oyun_game: "Oyun TV Ünitesi",
  room_v3_pouf_oyun_bunnypink: "Tavşan Puf",
  room_v3_pouf_oyun_bearpurple: "Ayıcık Puf",
  room_v3_rug_oyun_checker: "Dama Halı",
  room_v3_rug_oyun_cloud: "Bulut Halı",
  room_v3_rug_oyun_tea: "Çay Saati Halısı",
  room_v3_poster_oyun_bunny: "Tavşan Poster",
  room_v3_poster_oyun_controller: "Oyun Kolu Poster"
}

/** The name a person reads for a room piece: Turkish when the app speaks Turkish and a name exists, else the catalog's. */
export function getFurnitureDisplayName(
  item: { readonly id: string; readonly name: string },
  locale: AppLocale
): string {
  return (locale === "tr" ? FURNITURE_NAMES_TR[item.id] : undefined) ?? item.name
}
