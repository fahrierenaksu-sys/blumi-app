import type { RoomFurnitureRotation, RoomV2AssetRef } from "./roomV2.types"

const asset = (key: string, source: RoomV2AssetRef["source"], integritySha256?: string): RoomV2AssetRef => ({ key, source, ...(integritySha256 ? { integritySha256 } : {}) })

export interface RoomVNextFullWaveCuteRuntimeAssetBundle {
  body: Record<RoomFurnitureRotation, RoomV2AssetRef>
  shadow: Record<RoomFurnitureRotation, RoomV2AssetRef>
  thumbnail: RoomV2AssetRef
}

/** Candidate-only runtime refs. Keep integrity hashes aligned with the reviewed manifest. */
export const ROOM_VNEXT_FULL_WAVE_CUTE_RUNTIME_ASSETS: Readonly<Record<string, RoomVNextFullWaveCuteRuntimeAssetBundle>> = {
  "universal_petal_side_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_petal_side_table_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/front_body.png"), "bbd2decbac6ef54f4e8455eeeeb6e8d32ebfdb097e66003c002fd12abfb061f0"),
      right: asset("room_vnext_full_wave_universal_petal_side_table_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/right_body.png"), "e8f960ce63a536dcfece55739893b5c11a0727062a7e5ee35006ea02fc498e82"),
      back: asset("room_vnext_full_wave_universal_petal_side_table_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/back_body.png"), "f748d66ed7289425276de9b5a32d0b5743435fe426d9aea868800e4a894a28b3"),
      left: asset("room_vnext_full_wave_universal_petal_side_table_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/left_body.png"), "4c76dc05e1b25001e7b6aa87030ed53cfc0226f0a63e694fad54287c49d16ece"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_petal_side_table_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/front_contact_shadow.png"), "267ae0472972effe64fbd2e8b6a96c071e6641ae682d333265f02e7f3dcd1212"),
      right: asset("room_vnext_full_wave_universal_petal_side_table_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/right_contact_shadow.png"), "609453a104c54dc6a5f3c5ec3e45099636d524af56de01e279f26654626f475d"),
      back: asset("room_vnext_full_wave_universal_petal_side_table_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/back_contact_shadow.png"), "f4b02930f92217068d589c6ba0cb733d59f0c160dca45b3f40b04f71d7c7067d"),
      left: asset("room_vnext_full_wave_universal_petal_side_table_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/left_contact_shadow.png"), "6b78b9527e1032371ecd11dc15620290f57ba0730d4a017dacbdc7e88d17e33e"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_petal_side_table_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_petal_side_table_a/front_thumbnail.png"), "b36273c52bf62e489ab75bfcc4b169fb6a71cfb15b9a1ecde90fe088418c01ee"),
  },
  "universal_cloud_loveseat_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/front_body.png"), "090fcc22573218cef4893508470855188d3fe9d0549e0032b54688d7ddb3862a"),
      right: asset("room_vnext_full_wave_universal_cloud_loveseat_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/right_body.png"), "3bcc64b6dd20c3d260f5253eb7f759bf575d142d48c353c4b014eef332382709"),
      back: asset("room_vnext_full_wave_universal_cloud_loveseat_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/back_body.png"), "a94f5ca895672aa8711e219c5bbb91b768a379472cbdfe2375f0e622678d8a9f"),
      left: asset("room_vnext_full_wave_universal_cloud_loveseat_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/left_body.png"), "342faabb4f69d0d9f56eaf33d913593bea56199826e752d7d1eeeb4812a8d578"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/front_contact_shadow.png"), "d3b2851b365dc4ce4394b2c06063dbc308036b9ed1ee837f2111935dbace892b"),
      right: asset("room_vnext_full_wave_universal_cloud_loveseat_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/right_contact_shadow.png"), "4c33e21e3726e31b7e8371a83b3e268cc82e13bb371e714cbae7903309324b47"),
      back: asset("room_vnext_full_wave_universal_cloud_loveseat_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/back_contact_shadow.png"), "af03bf6b7cbd1982e2239e14a9d03b62b9afa0f22cb96c94a8b367675c2e52f1"),
      left: asset("room_vnext_full_wave_universal_cloud_loveseat_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/left_contact_shadow.png"), "7924936195d198ed871bbe1d3bba0dca76aa0a24991602e68006a2bf43055555"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_loveseat_a/front_thumbnail.png"), "c4e6f3b292046b3e9eafa16ff712ccad232f7a7e10c5b2d6faa4810e1814af61"),
  },
  "universal_orbit_floor_lamp_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/front_body.png"), "334130a2556c29b1da378611b089e3918a13d81a01aaf74daf568bd7be6706bb"),
      right: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/right_body.png"), "97fedad91b6fb3fc61325b033705b265db512c6b7e368702797e4c96f83b1368"),
      back: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/back_body.png"), "4bd493e208818c481dae48eb25c7f9b7b97a225b7854e3174c2a49641192f043"),
      left: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/left_body.png"), "79b41848402b4b22c1ce1872fe718e12cb143da643ef294fe4b7bc16fd614c03"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/front_contact_shadow.png"), "7e24c9ef91d86e74b4249c793d52bdd14490f3a514fd902c6d65eb10aad7277d"),
      right: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/right_contact_shadow.png"), "5dc38cb567fbc968c66d17566a89455d9efbbcf3291a4a60ac2afbe1c2b10d03"),
      back: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/back_contact_shadow.png"), "8c7e51e688ac6e1565ae0a7d123e1e3f0cb47d5635580b95032518e100af39be"),
      left: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/left_contact_shadow.png"), "9c93c6cfe8b4b489b2031ce62888534ad5360df4fd7759bd7027cfa8d5a5fe3a"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_orbit_floor_lamp_a/front_thumbnail.png"), "2c8fd00c06f1575ec0ff873d420272faeaf436e59e0eac3d8166ead90f8f2952"),
  },
  "universal_tidy_work_desk_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/front_body.png"), "186334c4c854d4f71cd08b63d4669d0ca2bfa0fa35a3f820f15acf3910bdf4b9"),
      right: asset("room_vnext_full_wave_universal_tidy_work_desk_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/right_body.png"), "4901d4b9248d5af343aae7b4b02b2b55ec221a0667a82aa2ffab2cc00f6ce873"),
      back: asset("room_vnext_full_wave_universal_tidy_work_desk_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/back_body.png"), "7754cbb6a8755b4b22abc4c31001477c9f835ce124ddc152753049b26f5a0b57"),
      left: asset("room_vnext_full_wave_universal_tidy_work_desk_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/left_body.png"), "eccecac2332879e09bb4a5bc6a58151aa2488d369f440a0cf15879af8754da6e"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/front_contact_shadow.png"), "01052b7f0005b94655e1e8bf809a27887195c6bc361882631cbbe10b91b7d870"),
      right: asset("room_vnext_full_wave_universal_tidy_work_desk_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/right_contact_shadow.png"), "807bac261f66f384d4b5f66bb2fd9d6fc7f2d75aec7e46c36580b1b5d260c17c"),
      back: asset("room_vnext_full_wave_universal_tidy_work_desk_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/back_contact_shadow.png"), "0c74190ff2eae84d3fbfbda97bfaa37acaa55ccb28f2ea81e3e5827625e09282"),
      left: asset("room_vnext_full_wave_universal_tidy_work_desk_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/left_contact_shadow.png"), "290cbac171ea0cf6b61705146254e9bb45f100784520265d7560b028fe4a054b"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tidy_work_desk_a/front_thumbnail.png"), "2a57dfe41d2d91f0e00ad3eef9fa7b048e551ec56670f2a533237a64faf55688"),
  },
  "universal_arc_coffee_table_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/front_body.png"), "b6a748c769422c817acc42c80ade2042de2ae167f1837df9e82858b10781e893"),
      right: asset("room_vnext_full_wave_universal_arc_coffee_table_b_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/right_body.png"), "f02767a4875a4e6b5e018fa33147007d5c8441fb5fcf69692128bfd22bf90f45"),
      back: asset("room_vnext_full_wave_universal_arc_coffee_table_b_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/back_body.png"), "9eb7371760adea6759477d84e686ed83046a59850f99a3cb3f9199282294d2bf"),
      left: asset("room_vnext_full_wave_universal_arc_coffee_table_b_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/left_body.png"), "5651fea77d2285581527eb19c76c2a3b45e478b7cb0a514199593c74189c36ac"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/front_contact_shadow.png"), "407fe846d89a1d8d188e2358f062e87ae402cdf9c9ebd66a4d250a9292606f48"),
      right: asset("room_vnext_full_wave_universal_arc_coffee_table_b_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/right_contact_shadow.png"), "603d3a6f1e1b001e2e63b6673c17b1b0150a95b84e77c652e3f28c7c6ab89de9"),
      back: asset("room_vnext_full_wave_universal_arc_coffee_table_b_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/back_contact_shadow.png"), "cd1eceb6f941bed5b699422371a6c7c9f8553113ed965a20e6af97acc9b2515e"),
      left: asset("room_vnext_full_wave_universal_arc_coffee_table_b_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/left_contact_shadow.png"), "e8e0ddc00eaf007421e9f7cdac1a16c4140bca771d6dd802404ced6e08bcdeb3"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arc_coffee_table_b/front_thumbnail.png"), "408734280044d7038cce8c41816004961c1db88923b2e17d8f0a1365ca7d05d3"),
  },
  "universal_cloud_accent_chair_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/front_body.png"), "6b9b5ee3c01fd131d10971d5161cb925b80d7055dbd56064a93071b843dde12e"),
      right: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/right_body.png"), "8cecc34d08d8add11a3341787f6634aa9651b29128a2d596e0f8b27f7747a1a5"),
      back: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/back_body.png"), "d0e50d076d9750d2c001b3c78831efeee369254840e79e123dfd4c39e831d74c"),
      left: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/left_body.png"), "1734bb1ff274130614ae615a14158d9a0704da180f5e83b0e69693972fd132e3"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/front_contact_shadow.png"), "f0d5f48815536c36de2c52a4e594d26fa2049a4a1076672eb6f200a745c7ce68"),
      right: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/right_contact_shadow.png"), "7b8052ebfee4155f27604f3fd75df88232de9ee724040c0124aea748ef6ccb66"),
      back: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/back_contact_shadow.png"), "63e251431768c9ad34c7c91114ea447dfd3c38117dc76e0332688869fab49104"),
      left: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/left_contact_shadow.png"), "9e456ac2fc904106988759794187a67e0492dd1402c109ce97a404897ebf3cdc"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_accent_chair_b/front_thumbnail.png"), "96828b68b36e7969401d1607f37ee8f8a77be792332677dfcd1134cfed687bf9"),
  },
  "universal_round_dining_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_round_dining_table_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/front_body.png"), "bb085e35c4ae35428d8c6b0d0d8f089a0e253c1ec62df5cd2d788f0d096be3e4"),
      right: asset("room_vnext_full_wave_universal_round_dining_table_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/right_body.png"), "283b8c5821a4f8490d42f6eba7300b6a8f5d04b341693c959019033781206b8a"),
      back: asset("room_vnext_full_wave_universal_round_dining_table_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/back_body.png"), "fef4dcb401496f255d20f8f7bc1896a7106002235475636944ecba9db225724a"),
      left: asset("room_vnext_full_wave_universal_round_dining_table_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/left_body.png"), "f866253962a2882432deb5fd845ea1f21a0c217946fea3f7c6cac302ee0989e8"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_round_dining_table_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/front_contact_shadow.png"), "1878ffeef7844300ec77568962035e537df7f334942a1b91aec668b90efbbfdf"),
      right: asset("room_vnext_full_wave_universal_round_dining_table_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/right_contact_shadow.png"), "b339cf906efd1861162f2c34da737ec20ad573f5c0c3f6719c1063056a3b2296"),
      back: asset("room_vnext_full_wave_universal_round_dining_table_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/back_contact_shadow.png"), "5dd9c410cd641af86ea1d9e776ca485c2a2fc447db3364fa8f6b2db659090d0e"),
      left: asset("room_vnext_full_wave_universal_round_dining_table_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/left_contact_shadow.png"), "34c8a15793753d1ef3bb0a2d0880436843bd4a3933c1170e704a5cbfdf9ecedf"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_round_dining_table_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_round_dining_table_a/front_thumbnail.png"), "fa0e62ca46c659f68d79d6a22b68890bc7497c552cbe4b001de92346780f97b5"),
  },
  "universal_soft_media_console_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_media_console_b_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/front_body.png"), "dcd50ff950220054f7afe56ac6d26f0f5ab35d0c84837657f20fe4b7d94afbfc"),
      right: asset("room_vnext_full_wave_universal_soft_media_console_b_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/right_body.png"), "e9d1c27c5921f91816d8405e1e735a0a32d102d82673c840e98466558dcdad1e"),
      back: asset("room_vnext_full_wave_universal_soft_media_console_b_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/back_body.png"), "a27caeb98ab6962e805b065a098057148883c6004c9a5c127ea41316306ce923"),
      left: asset("room_vnext_full_wave_universal_soft_media_console_b_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/left_body.png"), "af352cf630b51a94455e16075af18325fdf2fb300dd2bb82dba263d511e6fe75"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_media_console_b_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/front_contact_shadow.png"), "1f18dec286429a2c7b66ca1e8c57c1e9efc2acd556ef1252679838cc72042f76"),
      right: asset("room_vnext_full_wave_universal_soft_media_console_b_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/right_contact_shadow.png"), "3a89744d343c3e6006a8da7e4403bf83ad8e938b9fb33f2a967c6161a2554dde"),
      back: asset("room_vnext_full_wave_universal_soft_media_console_b_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/back_contact_shadow.png"), "ea3ca6671d1bab4c6609095ec5b3003be372d5be447b6160b7262f2b48b831bb"),
      left: asset("room_vnext_full_wave_universal_soft_media_console_b_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/left_contact_shadow.png"), "a858107075d62c1abbeec1f32db17359227a206de25b96bcfe9c9a4ee6a6ea8a"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_media_console_b_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_media_console_b/front_thumbnail.png"), "71ef167766d549dd5c9cb3cecbb1822cc0f69ee9ebe26dae6106628ec1af5fe6"),
  },
  "universal_open_bookshelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/front_body.png"), "07a690b428a61f364280d176ee4cd9ec4e7d710f860135169e9854e932ae6b87"),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/right_body.png"), "c8a4b4cf09159e3a0f9f8caa8411f37e06e1445aa05c402e637f070ea3af5a5e"),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/back_body.png"), "8038687316057afc7ba1a48bc0d456281df6c5a4a94a75c4bcac431bec86a6fa"),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/left_body.png"), "87ad82aca31a0f0016c3dabc6927bd7311088369862a5f636d41d3d5fc1a001f"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/front_contact_shadow.png"), "ae7b9203aca644c0daf6424177c80543b050d5f151696362698048a7cfa0566d"),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/right_contact_shadow.png"), "58397e13378d53b328c8b6792d0e49a4891876a0093fa685a5488820d1c48f82"),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/back_contact_shadow.png"), "bed1ad2535a41ab829fceca9903851e06a7ef0b4458dd4a0650ed2918ca2894f"),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/left_contact_shadow.png"), "060c13ee48565512bd9d9299b56cce473314adba92b270ee5110b1fd827957a2"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_bookshelf_a/front_thumbnail.png"), "b815cfd0836c1ec55b55dd7bbbb359301518477e957752020efa221368ad85d5"),
  },
  "universal_table_lamp_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_table_lamp_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/front_body.png"), "839dc9996becacb6b4001726f25fe27dd051333fb49f8e5961695ba974baca25"),
      right: asset("room_vnext_full_wave_universal_table_lamp_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/right_body.png"), "e049b74fe3c89b02bfb0c868bc7577f471a78da166a545099b8565c259ad0371"),
      back: asset("room_vnext_full_wave_universal_table_lamp_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/back_body.png"), "6e7ad72b877ec27ecf24213c14320ab702792e08aa77584494be43c73b8d0bcf"),
      left: asset("room_vnext_full_wave_universal_table_lamp_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/left_body.png"), "bb773a9d4a77c2b4f202a4c864e962bdb51087452d3a7df423ea2d6fce540915"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_table_lamp_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/front_contact_shadow.png"), "a7cde88c59e428bd5812ff285fcbe5490a546f3e4ca94baa798505850040887a"),
      right: asset("room_vnext_full_wave_universal_table_lamp_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/right_contact_shadow.png"), "6ae5f372bf601a6bbd96f3a34acf3cf12033441385b372feefd22b839011e117"),
      back: asset("room_vnext_full_wave_universal_table_lamp_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/back_contact_shadow.png"), "0c54e258fa056c7013d2af89011e75957ed35ccec468911c1ce5b602dee1e24b"),
      left: asset("room_vnext_full_wave_universal_table_lamp_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/left_contact_shadow.png"), "3cce8e4310a79b7bbe126582e5e0168827d98b27a292584fe3825b692bd96740"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_table_lamp_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_table_lamp_a/front_thumbnail.png"), "05c707da02b5f1cab1fee0d9c8f71ee42d3dfd275843ad30eb3c1b458194e974"),
  },
  "universal_wall_clock_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/front_body.png"), "3d3e45a68c424a0d1001457d96aadcf73ede070fb1ce76fe023b04ed9169ed00"),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/right_body.png"), "8f8cf54bfca351e0b11b10f5c3af8106e76657a8d9b8838b79f59436410dfa35"),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/back_body.png"), "05f39b584092c25fc80120a37e611fa7736f87d9dc647fed88c224eccfb979ff"),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/left_body.png"), "4a4c005b6bb887d3fc47fbc1520889a82d289098e55e2a17770840ed4a2dd090"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/front_contact_shadow.png"), "33b63a11e51a856b727b5c1c2fcb44384a07bba74bcb361538e43430f32056a2"),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/right_contact_shadow.png"), "1d76d02cc66f78f3af4825377a289bade43cc7e9aa8de0f0c62fe573a1dc3d38"),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/back_contact_shadow.png"), "606a2a8202c6f366e26698fac338bb2bcd634111d5a6cd83cd6429658c79bdc0"),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/left_contact_shadow.png"), "a554edfef9cc94722e641750204189763a390810d1bd48c091ab1165fb3bf14c"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_clock_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_clock_a/front_thumbnail.png"), "3dedacdd7f4b054075ac182065193357feb9d880343093b595f3afd285fdef85"),
  },
  "universal_small_tabletop_plant_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/front_body.png"), "e4f5d828e88934483a696fab48e5592a9f520f6b90c6b5c8a09a045dacf5dc61"),
      right: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/right_body.png"), "91860e196b70664581a1f6c5de5f1cbf03500d3174a0fc7c172d987f7f198e4a"),
      back: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/back_body.png"), "f26ac971c14e2b1bf0374c2b4ad01c612e179c2868aece1dc238c86ccd8ef468"),
      left: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/left_body.png"), "a3e583ec4dbcc292a8ec4862675c24e6d46d99ed885e41b0ab95819157b04e19"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/front_contact_shadow.png"), "069024c8b9a715e4986390bc210285f2dc6626f2709e6214528c1074a0d3fb87"),
      right: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/right_contact_shadow.png"), "6ae0b4b558b742b6c1b4ddd941a5cecb57d58619e2c41441604478950163b759"),
      back: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/back_contact_shadow.png"), "faa75cfabfc185bc9c9db6ec1d3ec8bc399cd781e1a7b5fa3367670d74ce2e00"),
      left: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/left_contact_shadow.png"), "100e156763ae075a60d68b18a25b225def5c4759c7f43169c382e47343581cb6"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_tabletop_plant_a/front_thumbnail.png"), "772ef1a0d6c5f5c5029322dafed191f3036e10b5e8b8ef3c98e044dc24af8366"),
  },
  "universal_ceramic_vase_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/front_body.png"), "9bce9af9cc9d45ee2074f96bc0dcb1b17be8c0a42c61b9aa97e585deed2f4866"),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/right_body.png"), "ca8628944935a5e9b8ad9a544abddac2259f73c996594187152a1f1bee45fd0d"),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/back_body.png"), "a18c7f306c7e87ea9758f3fa452b18877840a60978fbd4c334f57151faac6332"),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/left_body.png"), "90b6e79d287b9cec01388e5d10500cced54c38e707b48100f51e1cb93c6cee18"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/front_contact_shadow.png"), "7aff3ec36d968f934a5b3e90667507d4b8458e279516d2e6d869c41b9eea32de"),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/right_contact_shadow.png"), "2e4e029741cf68a3bf6a54b1df48f7dd6888d66b9c127f6969c1f590dd63bcdb"),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/back_contact_shadow.png"), "9d36667a5b6c44c76693bfe35fa73a52d835f48f2c6f8de1d7630540c608d254"),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/left_contact_shadow.png"), "d78083c2105f35b89f11ab69ea1a16f17216f4979df2c7f9b06ead63a67e8be9"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceramic_vase_set_a/front_thumbnail.png"), "47edf69c7cd2661271f1a03c09a893c292fda910fdc6c1f1a511a7be79e90fa2"),
  },
  "universal_books_magazine_stack_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/front_body.png"), "904f732e045fdcebd49b0f8b3c88a34fff91ae122644a1a04a6c15cfa90b4c3a"),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/right_body.png"), "d696a2efc66dd21294a5e0a6946d3a72b72af162d0b0c05e5824c028e385a19b"),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/back_body.png"), "9cc6e5ab3da0c75509f86c14723c50b36c7897e60de3fb9b21416ab9802a83a4"),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/left_body.png"), "a839a1750dfcfb83ba699541a41edcd2a84fa6df4a9e2208688f5dba07a1c8be"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/front_contact_shadow.png"), "749c72553bfd62adba03cb50d7b49d22f7ddc9ebfe61634542303e541ff0d984"),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/right_contact_shadow.png"), "91feb69a23071fb0b439fafd096f5bfce083e835e260b4c2d1843a4014ce8e40"),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/back_contact_shadow.png"), "fdea5557c294f7ed3002a6733da69f774e9f43003897af9bcd3d77d036631ca9"),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/left_contact_shadow.png"), "cb8051d2a077bda798abbdd7039914b1446029d39200c208bcec06e06e7d761a"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_books_magazine_stack_a/front_thumbnail.png"), "d7d2c77ea9c5af37865260c64294e5050316136297386f1bce216cc92a214f8f"),
  },
  "universal_tea_coffee_tray_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/front_body.png"), "73458f3aa7f407ac66cc6c643373c2d64125eba1d58822febbdddf06ca0567be"),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/right_body.png"), "53a1fb2f1ba35a5ba47995ac7efe378c2b9bf3566e20b305c0a8bb487d613681"),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/back_body.png"), "8c0dd0abf13afea245a150c0c2a89afc926693f8057bee5bce81d5d6d1070370"),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/left_body.png"), "fe19c25212c60043f5d1ba0c226bba10cb82a1d5be98e96451fdb2a62f50f97a"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/front_contact_shadow.png"), "5718301ea74f4d90c8e5dac7bbb067ed360b365f1c17018625407ca640e90273"),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/right_contact_shadow.png"), "c331647738505f36c3a14c8b087c4dc72add9cd6eec6d1852c0ada81e69b7b5e"),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/back_contact_shadow.png"), "303b4746356f65b797ed3c3dfd8593142e83e072d5eab7187fb0f75437cb9beb"),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/left_contact_shadow.png"), "2c867b3eae39ef896a963862082852517ced0baaa06b2567900d1454098ff38c"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_tea_coffee_tray_a/front_thumbnail.png"), "2310499b79f17e5d7bc0864e2a736c4f2dcb073dde3f1815dcc4cef6327b5ba0"),
  },
  "universal_dining_chair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_dining_chair_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/front_body.png"), "546adc083bc201efb3a7a2fecd2bbef480b778e8c89c2241bdb7d374352adcac"),
      right: asset("room_vnext_full_wave_universal_dining_chair_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/right_body.png"), "60ef062cf67128a51f89c305738e3410a949c27cf04547c1864eb3578396a6e2"),
      back: asset("room_vnext_full_wave_universal_dining_chair_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/back_body.png"), "71f37a89066d7aeac136ddb869a6593b2b4c72d2df4dd4005c36bddb8f76b12a"),
      left: asset("room_vnext_full_wave_universal_dining_chair_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/left_body.png"), "4ea247e0fbb8f9b159db67fa6df68e242df25a09fc4ce0e9744ddc4dd8e587a0"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_dining_chair_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/front_contact_shadow.png"), "3fa0847e3fe1b6d240b84a293656b88182e4b5e03e79e915097a00597af9e138"),
      right: asset("room_vnext_full_wave_universal_dining_chair_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/right_contact_shadow.png"), "c13537901e3f3e03460a6087a2fb93e9e9d1760355f8f9f4a80690d71e024c9f"),
      back: asset("room_vnext_full_wave_universal_dining_chair_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/back_contact_shadow.png"), "ef3a62a1b28518f404fd42d0e41fe3915d3320147c9a4c82960d03bee4468af0"),
      left: asset("room_vnext_full_wave_universal_dining_chair_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/left_contact_shadow.png"), "4a17ccd3383d6423dfbb57c83c67d24cce0c32f993c2362f0a3e8c610ee4ab2e"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_dining_chair_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dining_chair_a/front_thumbnail.png"), "165adc0d8f655cadfe529a8481db0546ca798df5d278f82e0c3437753269483c"),
  },
  "universal_desk_chair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_desk_chair_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/front_body.png"), "382bcb0833d4318fcd04b05ea966dc303e80ec79f8ce740c3a022b17df330487"),
      right: asset("room_vnext_full_wave_universal_desk_chair_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/right_body.png"), "ed944654775d7e2b1d715d4adb592259c7773452d5c76811fc9e3284b7aabc02"),
      back: asset("room_vnext_full_wave_universal_desk_chair_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/back_body.png"), "3d41e86613d853397525490d0d96857f3c3cfac109c18e79801af9742ac2e812"),
      left: asset("room_vnext_full_wave_universal_desk_chair_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/left_body.png"), "6474dd6051b5c6abc99eace099f6414396424ad49a05d51c0b9bb48c4ec23a57"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_desk_chair_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/front_contact_shadow.png"), "f7f63bcd797376aa88e8928ba71ac99e91bf201e5005ac0fa8add828762ee7d5"),
      right: asset("room_vnext_full_wave_universal_desk_chair_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/right_contact_shadow.png"), "ab2a6bbf0525bb6e6236548f4e1b9d3ebb0e7978f563d6dc7f20212951404e0b"),
      back: asset("room_vnext_full_wave_universal_desk_chair_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/back_contact_shadow.png"), "6153c97af9d5ea9c558ac2377b6be71f62c9d33e918513312e76214b332af4a9"),
      left: asset("room_vnext_full_wave_universal_desk_chair_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/left_contact_shadow.png"), "016c70a763b21f47990c180f14d80d1740ca9b1d035c617ef86555d6862b3dd6"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_desk_chair_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_desk_chair_a/front_thumbnail.png"), "299560f3c8bd73d7a334770afc69f9299200d834b4244c65d9f6caeec15a6110"),
  },
  "universal_bench_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_bench_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/front_body.png"), "cc34b3b80720004ec518eb751d6cc52f0acf2ec0a31b98df4cc3ec1ffc8591d5"),
      right: asset("room_vnext_full_wave_universal_bench_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/right_body.png"), "b7af55a72f365c048eacf250fd4d89b413dea32aa14277595405541590eda7a8"),
      back: asset("room_vnext_full_wave_universal_bench_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/back_body.png"), "3be180bebea4653d0e79f0b76186b6428f31a023757c88d8b8be4757284450af"),
      left: asset("room_vnext_full_wave_universal_bench_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/left_body.png"), "4d1351994b748ad68717896c804ac92ee9dd2b4114527e679301e7699238ed1b"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_bench_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/front_contact_shadow.png"), "7344c368bc9945eb5480132beeab28504c0721b307bbb37d45252d273aecf65f"),
      right: asset("room_vnext_full_wave_universal_bench_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/right_contact_shadow.png"), "d9cd9bbc886ccb55ef2a3d530812ee60427622cca1575f12df32a2d6053e3fe9"),
      back: asset("room_vnext_full_wave_universal_bench_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/back_contact_shadow.png"), "bd68f782e7c5ae8a64e2b423df14b6a29eeeff634638fd0a48e2f7b07366805e"),
      left: asset("room_vnext_full_wave_universal_bench_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/left_contact_shadow.png"), "ca1cf81ab3ee3e302291c126f786dfc07d3f826b5cacd376cb9033fd0ff76d6b"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_bench_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_bench_a/front_thumbnail.png"), "edf922cb4a4ee35904c260a6670d48173c57b6bcfa04868cd3357963650bfe8f"),
  },
  "universal_soft_floor_cushion_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/front_body.png"), "a832fa1e25a1d9bd2c5e342fae4b51aeca7607293755a1b8d125b3eabb0ca808"),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/right_body.png"), "1bc76245ad59a2aa11678a553c2dbd9499451d819707e8ee1d30e16277040604"),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/back_body.png"), "44a689ab1713312aaf37fbc6cb33984dd387de1b7d1b968b0ea3529e82b3be6b"),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/left_body.png"), "4ecc3410c7bbcdd1ffe3724c8a929c2ad5e60ade561824deb60d1a78b9b6a6dd"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/front_contact_shadow.png"), "cccdca4d1f4708909162bb2e73bbc1de6102cb7ccb07a0dad348a3ee1c0d2dc7"),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/right_contact_shadow.png"), "f166a2ead3e42f0121877964e1b79ab933147760fc04fcf60c394720d66b57e8"),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/back_contact_shadow.png"), "c1e6487400b6f94435ff8f75f970ff733a2377803431341d9af168c3cd3df8df"),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/left_contact_shadow.png"), "6c7e04db9033336f10e44fd4e43517b9cd3790f6a5360a27c873eac417588a85"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_floor_cushion_a/front_thumbnail.png"), "b9ca21568a189bc6040bc942e61009ba1759200006acd940304e342410441b7a"),
  },
  "universal_pet_bed_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_pet_bed_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/front_body.png"), "e5e7811bbc16a9b4d75e09778a1915094aff969e97be1ab7e976b3eaa79a6ab9"),
      right: asset("room_vnext_full_wave_universal_pet_bed_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/right_body.png"), "6c950caed28229ba8e9d91793baad2d4d13f157b52662159997760e94f16e191"),
      back: asset("room_vnext_full_wave_universal_pet_bed_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/back_body.png"), "48b65443b7cea4946cd2de0cbb0124df702b791e6b43f46917c834c29a49371b"),
      left: asset("room_vnext_full_wave_universal_pet_bed_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/left_body.png"), "34c4e7c63443561104fc706f091a2061fad787e17569de6e5059b7f0c761cea7"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_pet_bed_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/front_contact_shadow.png"), "cda1b15ff30c950a91ee4af84b1553854147dd80285c9846171fe6909e114689"),
      right: asset("room_vnext_full_wave_universal_pet_bed_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/right_contact_shadow.png"), "66c3b946581c1bc376dad96aa0dda764f0bdb0fc19261f3f4acf3424cb15f0cc"),
      back: asset("room_vnext_full_wave_universal_pet_bed_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/back_contact_shadow.png"), "b38c46e8dd60490b1aa2f488fa0c9273338ca0c1d67f6b33e43f319c626065ad"),
      left: asset("room_vnext_full_wave_universal_pet_bed_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/left_contact_shadow.png"), "5f63324f8b5dabb54c00cbbfe06383e82f030649f2f3027fabaf130926fffea5"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_pet_bed_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_pet_bed_a/front_thumbnail.png"), "9bbff641f3e637b87f9fee8fd4c0b40a10203c9211047ae9144c02fbd673edfd"),
  },
  "universal_nightstand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/front_body.png"), "05d94f46b21778209965d301a45b0d81f14df08b0f57a5b1beb64b527f7b7347"),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/right_body.png"), "f8b0bd085fd0b748f0f4e2db0a427f27c9349139fe2cc75fce22f47aeb187103"),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/back_body.png"), "a0426ff5d08ea34d09f89fcb489047c608f74898ae136865408ba40d13f70d17"),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/left_body.png"), "ed403af95ce959e028831363c85f4295a5030074b3b8f6e1acb05b494693a01a"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/front_contact_shadow.png"), "ae81037304e6a8ca9267f68bf202ab4844c5c66dd0076609286f6c9c4acf91ca"),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/right_contact_shadow.png"), "71bd87a818647073b94d910f12b8179e7e394f19649193cad59b08ba814465b4"),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/back_contact_shadow.png"), "84ac30891838230f86823c068d8b48c648e6c38c3c91dcaddc0d42f37311fdca"),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/left_contact_shadow.png"), "cfc283866f7d84ea294f8797e6dbbe88e24f3f4df8961c633b91aa04cd99697e"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_nightstand_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_nightstand_a/front_thumbnail.png"), "c094154debfdbdc477170a183bb88dde0383b24ff682ae41147320ebdd530f26"),
  },
  "universal_laundry_basket_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/front_body.png"), "2bec6c120d1816a86f8cc6605a36ab270037264b9b13dc26ebb3d3215b2b6203"),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/right_body.png"), "b999ed47ee11bee192418b09a7c6399a38d481d9b49d59638d5e35278c2764e2"),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/back_body.png"), "1f43c91901611d8519a7cdac60188a80aeb9d8b8ac019b54ad9ee3f085db2e72"),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/left_body.png"), "528c6fa3d98ec3e06f70e7a60f676dc442a415ce743010b92a03023c0b48a7c3"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/front_contact_shadow.png"), "7d655213c5000baa5efdb036c70a352c31b3485c30724c5f4ff3f1f6e0359d6e"),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/right_contact_shadow.png"), "1f54db95b22ada8dce079fe342935719654ba0643551d9023fb5953a6bc48fc9"),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/back_contact_shadow.png"), "2c6da03135062d2b7123f46a24ad20a32bc685d7e912c4d13906be38c5768969"),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/left_contact_shadow.png"), "b349e51e93c85e7cc0b34a04bf3d26c4020b1d567cd08dcd90017b00e85c129f"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_laundry_basket_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_laundry_basket_a/front_thumbnail.png"), "5f310cc2c146e5abb2e4086360e79729e02defc8f60ec358bcadccc29b50c341"),
  },
  "universal_cushion_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/front_body.png"), "65ecf2ffbb9f904593004e5f63bb1ba457c7706eb657d13b3d6392e9d19d783c"),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/right_body.png"), "8a58b631ce34a9b45176cc44530926669cba8319f28574fa6e9e319ccf502d00"),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/back_body.png"), "8def0fd6c7f9e6873362645bcf613308670159421401badc8489698ec85342b8"),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/left_body.png"), "ec12309d0a46df39d7b295766b36c7036b8bc81e30751a87b2e0f7cbea44adb2"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/front_contact_shadow.png"), "938c1e23f4c01f8b73e83dea5a22e5541f5821c93c832c9cf3f001612336fd05"),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/right_contact_shadow.png"), "efc06ca1092ee724adf304874186fb168b8335f10ff309bcf8dd5875a8e4db8b"),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/back_contact_shadow.png"), "0e2db97a84e85c1ecc10d78b9d5f3f5cfa254f6f5199f6976ad2563f76098759"),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/left_contact_shadow.png"), "1f62ca1017623dfe8f762f78c856fe2143e9765101b7d03c545912933ef3274d"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cushion_set_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cushion_set_a/front_thumbnail.png"), "68be94ecbad522d5d239d50d1e10a913a290f38997dacb8950c2cbc1711af149"),
  },
  "universal_vanity_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_vanity_table_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/front_body.png"), "212ab62b33a3dfee14e4e5cc53e9ccfc690a6d4faa933f855460467d066e0cee"),
      right: asset("room_vnext_full_wave_universal_vanity_table_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/right_body.png"), "7b645a4691e3aaef1266843d56a16a6604497f4d0f4cf11b5179f52cbabb763f"),
      back: asset("room_vnext_full_wave_universal_vanity_table_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/back_body.png"), "06258183bc6ae9a3f96b44897bf28d141c9d98c81206f925a933b46b5c5734a9"),
      left: asset("room_vnext_full_wave_universal_vanity_table_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/left_body.png"), "20fd8d38188e5d37d5614c03d436ded94e8060eb7005abd9e534d59f56744889"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_vanity_table_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/front_contact_shadow.png"), "800cfc5727b1e1db3efc6696dd44ef6c2ba6f0a10e9a242910217cc45f5fec77"),
      right: asset("room_vnext_full_wave_universal_vanity_table_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/right_contact_shadow.png"), "dffd22ed3f9c882385471e0c6ca21b1148595f06ef45b2b55cec893b65a635bc"),
      back: asset("room_vnext_full_wave_universal_vanity_table_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/back_contact_shadow.png"), "556158a295f7f24ba2e29388de6576627563a4e82b895b51f50ffa14a697dc56"),
      left: asset("room_vnext_full_wave_universal_vanity_table_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/left_contact_shadow.png"), "e6c8cbc57d7d2b4b3562f79eb974f464a12b0d6769e7751bb0dd7091dbec3d2d"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_vanity_table_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_vanity_table_a/front_thumbnail.png"), "ea09861501e844f4b3da0f8a55cee4353fbd28c219f445c83c24f72b8115127d"),
  },
  "universal_shoe_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/front_body.png"), "18e5137acb4af07ecb3f9af3aefa5609b95fd9e252cb310ac1758a7822b70828"),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/right_body.png"), "6962b9316b454be2b6011c9f4e6e67bd1591af7c43c8ddf8c284abeb24ca7a2d"),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/back_body.png"), "a3438631884e58a40f3f7a18dd2b16e3e90fe4646b9de8927559fd8606156096"),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/left_body.png"), "846202a59580f18c17111c0e4b12839c4956c5ea29e51256e57c8abeddaa349e"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/front_contact_shadow.png"), "877f60f026bed72b1ad38f579697cf60e00d64bf451fe24ef812dfeaf996308e"),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/right_contact_shadow.png"), "9bae5835edb08e6e2c0111d17c41bc7ddaaa3b0acd978e85712e54ece2c8796e"),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/back_contact_shadow.png"), "57643ac24b153454336e87bf11f80f701674cd2fc5d52d42a1cf2d7ae177fd09"),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/left_contact_shadow.png"), "b9ef91e8e8690ac09d2683553a3cf46c1824b4e3f644751ed93c0f9525ee15dc"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_shoe_cabinet_a/front_thumbnail.png"), "2760e2bf493c44ced32556adf1719d07dc9399c000951891bfbaf4ee9d33bd30"),
  },
  "universal_long_sofa_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_long_sofa_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/front_body.png"), "5f2b2faa1c91d3b6d25c16b4dee38e49e523bce50eaef8454afea68c9ce4e146"),
      right: asset("room_vnext_full_wave_universal_long_sofa_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/right_body.png"), "86f7c07d6b87b91a26cbc16e3753f575f97d9cf3cbe50825d626bef66d5e7f9c"),
      back: asset("room_vnext_full_wave_universal_long_sofa_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/back_body.png"), "eca4fc64199ef50d6b1b4c4bfaec12069a8ef85a422f0f2d59b30d0939362746"),
      left: asset("room_vnext_full_wave_universal_long_sofa_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/left_body.png"), "b22960b9e00ebd372ccca101b72f54dcc715c5f60ec4758d9de5b4482226ae1d"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_long_sofa_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/front_contact_shadow.png"), "159f57aee49254b9447abec793d092a10c2d71cd27c6e99dbcdaf1961823f8bd"),
      right: asset("room_vnext_full_wave_universal_long_sofa_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/right_contact_shadow.png"), "76fee24a83cd762d03ffbec5f21aa0afd732c66de262f865f40ba02a628d138d"),
      back: asset("room_vnext_full_wave_universal_long_sofa_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/back_contact_shadow.png"), "fdc2fd24638cdb3a7ac78d6a206541131a13124e2b9579e7e2b08be7143e45b4"),
      left: asset("room_vnext_full_wave_universal_long_sofa_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/left_contact_shadow.png"), "6e3e3e880e12a546256539e638fcacc6506ec10c230ebf7ba6beec2591dc24f7"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_long_sofa_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_long_sofa_a/front_thumbnail.png"), "7664e560b7c36006f03378c6e2475e5304562642803afed992966da19ca2036e"),
  },
  "universal_lounge_armchair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/front_body.png"), "150e703cf76bce2fcc14156f32c8b233d3be3498d3173b568cb7a848aa7a5b27"),
      right: asset("room_vnext_full_wave_universal_lounge_armchair_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/right_body.png"), "c2e1227542de8a7f2d325d617ebe98474795c45bd116e601d87d775f9e91a517"),
      back: asset("room_vnext_full_wave_universal_lounge_armchair_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/back_body.png"), "077cd24c3ee21f1ea12410fb72bccf1132f8d6440925ae53d57d7f1407eed599"),
      left: asset("room_vnext_full_wave_universal_lounge_armchair_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/left_body.png"), "571c6839992ae8c9eaec38dfb0e113d2c02b864a43e4aff3632fb7d6a287b8e6"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/front_contact_shadow.png"), "2d91b3b06d9f96132c870049f2e182df7e7756a0d7f0b7e94ae27189c5cdf490"),
      right: asset("room_vnext_full_wave_universal_lounge_armchair_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/right_contact_shadow.png"), "774e516f5243f72302a2185b8cb2e76ca686a0a00e95f6df3ad0da39b28f8d89"),
      back: asset("room_vnext_full_wave_universal_lounge_armchair_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/back_contact_shadow.png"), "889c361556fbc598aa0eb7759ea9e81308b3b7919f3c4279004be54b311e00c6"),
      left: asset("room_vnext_full_wave_universal_lounge_armchair_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/left_contact_shadow.png"), "d7adc571a6e27af434f075b004cce3714ec08020af2b0583c3e8a652e8508da7"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_lounge_armchair_a/front_thumbnail.png"), "dea36dd4a6d5db815a691a7a050bfdec1fcc61b87c6664a129f4072483a75e1b"),
  },
  "universal_cloud_bed_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_bed_b_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/front_body.png"), "a4dd7c19fae7c611569e341fe08c1e90fd0c4afef69c1d9ce097e39e5f244c00"),
      right: asset("room_vnext_full_wave_universal_cloud_bed_b_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/right_body.png"), "56bfb7cd8f5feb65af7f255b448f7d67b971aa4abf4096faff90a51ac121af44"),
      back: asset("room_vnext_full_wave_universal_cloud_bed_b_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/back_body.png"), "33b4086cc275cb1f552e0b0c07e6263bed33caf1c77d855716b59799f869abee"),
      left: asset("room_vnext_full_wave_universal_cloud_bed_b_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/left_body.png"), "50fd6963de92598f369f3177bc55a3ccdcad195c724e19c62f69a6fa6c404674"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_bed_b_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/front_contact_shadow.png"), "174a8e42b40da28ed777bb389865f1f33dd349fb250e004e2858f8af24207bd1"),
      right: asset("room_vnext_full_wave_universal_cloud_bed_b_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/right_contact_shadow.png"), "0fa6020a98623ba65ae02779ffe6cec2f1d1192f28d82e9ccff0365d980486c2"),
      back: asset("room_vnext_full_wave_universal_cloud_bed_b_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/back_contact_shadow.png"), "7d51b4b647ae1e64791a28b4e6b2f69260fd355f72598256f1974330e01e9bf3"),
      left: asset("room_vnext_full_wave_universal_cloud_bed_b_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/left_contact_shadow.png"), "f2bf55613c93f29cdb8ceaca7d961c397f97324849ca15fcb504a8eada9690ad"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_bed_b_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_cloud_bed_b/front_thumbnail.png"), "d19c9915ae8cb51ab702e0f1ef94e4f0461386843e49d37d91cb002616a68275"),
  },
  "universal_rounded_wardrobe_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/front_body.png"), "95dc34077fa4bab292bb5ac522372a3f238b606687be49b830c14d1e042e388b"),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/right_body.png"), "abf6290fcfa63847ab3159dd2fc23000840fe1329511c2e8e34c2c34bdef4c58"),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/back_body.png"), "a7582370b4c0f64ea86e43f70793b4cf8a6d30846829d9d6683d729386632cfe"),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/left_body.png"), "fcf969b329b7a94e40ecaa75f0e0fdcc70072ba7d63292b38fc1d59b10a2c835"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/front_contact_shadow.png"), "c843fda04700cbf29668333e0f3c8cd81da2003a81695ae7a5f94e4188756cac"),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/right_contact_shadow.png"), "ff2a6f5afb49e1010f181ec2eed746dad6ad613cc6290acced04bbe3f61a7052"),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/back_contact_shadow.png"), "52db319b484962aa017253e695445152e093adcc197b11c74e2a5a037a5cd674"),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/left_contact_shadow.png"), "d6508753bc140313dd543155ced1b420a54d70383903ab5771d7102677c572b0"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rounded_wardrobe_a/front_thumbnail.png"), "076c988c5980553c79fd9c5a65a95af66ef2c0db47539fa44c0a87bf2ce87013"),
  },
  "universal_soft_coat_stand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/front_body.png"), "1c7f174407bfac05104b7f82a5177b4b2fc8b7d6001b730fad95bdb884e373b3"),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/right_body.png"), "88a8543ce33700e699b6eea91d3c20039704359b2c64ed49a75aede931362cb2"),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/back_body.png"), "42a4bf6dc803d09b105902333751d2d62cf722f076376b2be22e3193957261e9"),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/left_body.png"), "bede7897e59de5ca25908a02bd872ee0e881b07ad9079b0d25773a0f757bb486"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/front_contact_shadow.png"), "60ef1a7d3a94c8654409f8d638f356b211b73575a7b630c907f89970cda3b511"),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/right_contact_shadow.png"), "fe6012be4408c4ace6affab1776597bd941d9d2fe1422e95ba8e3d7409470482"),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/back_contact_shadow.png"), "aeb4581d2b4ee42f017d877ece2ad0fc011d99884836df2a8f4d157bb60754ca"),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/left_contact_shadow.png"), "58904e471ab48889f8647bcb5480b06aa4e636e023bb7cd14b6d7c4044d75844"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_coat_stand_a/front_thumbnail.png"), "17a6a81947f4e919752caefb28914a5c21f51d7d6de6b3df8306bebae8335069"),
  },
  "universal_soft_pouf_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_pouf_b_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/front_body.png"), "18c4e1ddf2d0927e00c76f0d6bb01fb9ee87502418ab2eff81848d89bf13303f"),
      right: asset("room_vnext_full_wave_universal_soft_pouf_b_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/right_body.png"), "2710c624c59f4a48b5909fde15f9b8e20156839f97380df39cbea23b17a14729"),
      back: asset("room_vnext_full_wave_universal_soft_pouf_b_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/back_body.png"), "3ecf8cdc47f5841e89125400610d5e661fde47beb75c09513b240da8b6801269"),
      left: asset("room_vnext_full_wave_universal_soft_pouf_b_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/left_body.png"), "b49fab34d6fd97f2260b9b586b00e69d2c1edb96b567caabbcd16b777612f274"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_pouf_b_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/front_contact_shadow.png"), "81d05dc6271b02c53461b40ab0df2f913972fa6e73829264310d5e174fca5b16"),
      right: asset("room_vnext_full_wave_universal_soft_pouf_b_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/right_contact_shadow.png"), "e5ec8fc166c90ae6720bbcc59720d20e721eabca5a312f24278e8db97317ca9b"),
      back: asset("room_vnext_full_wave_universal_soft_pouf_b_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/back_contact_shadow.png"), "b3bb088c61d142845322a39701f3fb77c88a37a36b16320354ffc9301785b1b6"),
      left: asset("room_vnext_full_wave_universal_soft_pouf_b_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/left_contact_shadow.png"), "f6ce422db627621470cd99a9dced0ae496bd2bd72df89154ba7f5f3730ab6a87"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_pouf_b_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_soft_pouf_b/front_thumbnail.png"), "eda545e815f5a303cbfe7899325d17b1ace2a2b0ad53918aca631df74c71a3f2"),
  },
  "universal_arch_wall_mirror_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/front_body.png"), "e9b35c8c4c04b6e133b55b31c9cec5823c4f5e2731dec640f611e7fbd141c3b8"),
      right: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/right_body.png"), "c9ec97f03b44a0406c1b46d9db9914fd76a277b4ce78404d49ca41b967d0f84a"),
      back: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/back_body.png"), "ef914f81c7bcc781f3e2290a83729583d60fe46a448106045656cea0411c878f"),
      left: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/left_body.png"), "aa081d21eb042d045449ac858c0a29b4895efbfd0afd08482454ec9cafc20ac7"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/front_contact_shadow.png"), "af88a5129f2a426ca2c6741d3fdf0ebf1dece1a27640662371b040659d2c7541"),
      right: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/right_contact_shadow.png"), "759ea9080df6ae9798a756d1a3177a583bb7d942786f6ef4918329f5866e5ec7"),
      back: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/back_contact_shadow.png"), "a7ea015d83e8d9c1a9fcabbfbd715d054a6b8d283daba1aa483388d28efe0ef0"),
      left: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/left_contact_shadow.png"), "16756547a3d0a80416295cdc748f7b8903dbe86117fdfbb86b0e8480babc5e7e"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_arch_wall_mirror_a/front_thumbnail.png"), "4ba4c699edf7421e470d7fa677824e204f5d3a90793f7665d79dc4bd01b54bce"),
  },
  "universal_storage_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/front_body.png"), "f17ec73b9350ba3acb3730b9498a6f3629df32ae2c8997d559fcca8084cb358f"),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/right_body.png"), "74da3f9591620fe176edba6d6c9d3d522720bec5266133cf12dd8136c277684a"),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/back_body.png"), "da21130a2c67b67643cba285fb1e643222e750b10189c0cad6fed2a826c7f8bd"),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/left_body.png"), "b674dd7cbaa11ddf6e94bccc1c2e7db734a8e85e15e750887530eaf2bf4e4bb6"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/front_contact_shadow.png"), "6a2f356b69fb17fa9011089b51eb85e1e87084178ca3f561508164f95118512a"),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/right_contact_shadow.png"), "0bbaefd2b33e172c1b4fd05c70107f127f04beb3c453837168efc8a0a712691e"),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/back_contact_shadow.png"), "17d9effc22cd4f3b0129ea6d522ed1b687cbafd3a3399e06b904555932d5a59e"),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/left_contact_shadow.png"), "4064116975293274e6bbc6412dfad48c0d1779cb9003e8bf1286cb287a803e90"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_storage_cabinet_a/front_thumbnail.png"), "34bc167a63fd845608f739c562022edd7d44fa09e067ed0a3b6eb0b305b51059"),
  },
  "universal_dresser_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/front_body.png"), "c30e520fe0c3377e51243234c60a07d47a537ea09355e850d74561a60a1db7c3"),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/right_body.png"), "df9381df2f64be589adea219983fd7c4dd7111fb18b3f1d561da8f18870a85f3"),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/back_body.png"), "49c71b9fda86042f7193ecadccaaa8b683d9e31c48a5384a2fb371aac68b1514"),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/left_body.png"), "6f78fd1083caf4131692bf99b3dad625fc27380160d687d7b063b9dd9df173cf"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/front_contact_shadow.png"), "5d3c6e1d39ad56970a411d5dc8be306b038653915ac2988aa5fcd9cc372bf6fe"),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/right_contact_shadow.png"), "9e7a085c155d1c2b7653486ec3ecf58a62503765fba8cea2d63feecdc93f837c"),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/back_contact_shadow.png"), "520f71666b2b25eeacbcb5e01b59d9dbfc3ae5dcf8088c6494572e61e288b1b4"),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/left_contact_shadow.png"), "e5821cab6e31e9ad813bac0e018c7adf6d9b6c63e96b9e24113c2ad73817f816"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_dresser_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_dresser_a/front_thumbnail.png"), "b4015ca84863529bb7dfa70aa347bd9ac306f8c65f66afc8daa69703a2eab4ff"),
  },
  "universal_console_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_console_table_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/front_body.png"), "06a0bf41907ec08760f88dbc47fa919508ac3d4596b8f8f211bec0581d196d8d"),
      right: asset("room_vnext_full_wave_universal_console_table_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/right_body.png"), "8b75a1fb3c3f4ed0fa805bdc75235879408bf2699a724ec86a33602971a6e8c5"),
      back: asset("room_vnext_full_wave_universal_console_table_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/back_body.png"), "34860bdf6390a85d3592d22d89bf709c9b094f628177c9cfcf78ed8e6b2a2b0f"),
      left: asset("room_vnext_full_wave_universal_console_table_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/left_body.png"), "3062bfa181624e185f74abacb629c940d39c5f0d158a42ee551331054e81e8b5"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_console_table_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/front_contact_shadow.png"), "7b19100cb3a4554886cffdf20c4daa0049e5ebf89d8ef40ad3a381f15ac4a478"),
      right: asset("room_vnext_full_wave_universal_console_table_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/right_contact_shadow.png"), "7466b021376e223c71bb9b2f5602c8c329bc6253017e33bfd245888ac3e6e03b"),
      back: asset("room_vnext_full_wave_universal_console_table_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/back_contact_shadow.png"), "1dcb3dc8620e6496afe9e1c56b71bf947e9b911a3655f97f6cd9c8219bd17852"),
      left: asset("room_vnext_full_wave_universal_console_table_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/left_contact_shadow.png"), "b758a7dcaf38acdce8d748e019eca9a61a2507050c9dd1f34f102195a8e5d30b"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_console_table_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_console_table_a/front_thumbnail.png"), "638f9fc00e583bc93bb29ec518da011f5899aa6951a4fd331a35bf7254e3dde2"),
  },
  "universal_large_standing_plant_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/front_body.png"), "504bcf62dce928852db803f0473d0286862cea14a92673d03cbe2c226eba3352"),
      right: asset("room_vnext_full_wave_universal_large_standing_plant_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/right_body.png"), "ade61b7f49a5056a02f008464cae25fdf46cb8d10e39b3e90508e01bf660b1f8"),
      back: asset("room_vnext_full_wave_universal_large_standing_plant_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/back_body.png"), "69dc7107e28bb41180f1576cfd5e1650c8f19f9012af507f2df9bf67d49c98b6"),
      left: asset("room_vnext_full_wave_universal_large_standing_plant_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/left_body.png"), "ecbbfd48f24686f92fe0487330beaf332fd4a6c93886aa7b329766eb3f133545"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/front_contact_shadow.png"), "9ab36e6b1eb1b8a3ae3d1575c45201f594d38eeae331ba641aad55a10493d3c0"),
      right: asset("room_vnext_full_wave_universal_large_standing_plant_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/right_contact_shadow.png"), "c7e9f3f276a0fffd677d6b2c1b758cbe83279716a45dcf0ba46e8d56965f62b9"),
      back: asset("room_vnext_full_wave_universal_large_standing_plant_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/back_contact_shadow.png"), "1fb51374264c936acc37c0b3ef3493287cc48106de4c4930ee339d8b5441b290"),
      left: asset("room_vnext_full_wave_universal_large_standing_plant_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/left_contact_shadow.png"), "e26bc03bd247cacf0c0babbbfaa56d1a652c6169678c9d84ab964789d4177813"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_large_standing_plant_a/front_thumbnail.png"), "f854777cd1b192059ec752e74c7e759abb92573fb3b71589d49329cab159d763"),
  },
  "universal_wall_artwork_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/front_body.png"), "236a9037763062ab3b29e3306d4064b21c5abcfce20164bad1a2e38fe9f80942"),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/right_body.png"), "390dd765ea63f115ab2e5f691a01cdd1b5426a0b0b393a7687b991e2fd54be58"),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/back_body.png"), "5fbe0ea30e1c96df430f93fad0d33858253eb2f7d731cc42db62c10303b58313"),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/left_body.png"), "6281688433c034cc5031d5a3c97b88353f7bc54b45aa3a89ba20c3d17651d868"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/front_contact_shadow.png"), "83c00d160b6ec617e3767f219b8593f6ba8df09cbaaa1e33371918a1dc42b868"),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/right_contact_shadow.png"), "751f69c4e1cccefd5fb167b0a01b3a54635fd47207daf9c7bf7f9b758969cbe7"),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/back_contact_shadow.png"), "62086ea9e6305b884ae4b343b8090b4fa22f244390425a44cc4e69052712c993"),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/left_contact_shadow.png"), "83d436697816441f6c769531064bb9572a986b2be0a057781066784a205560a8"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_artwork_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_wall_artwork_a/front_thumbnail.png"), "242bb53fc8b40ee4a0fb311165d18658c88fdb6304871340df7d7a05c0edbd2b"),
  },
  "universal_ceiling_light_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_ceiling_light_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/front_body.png"), "0f9447ebe6cb082e28c51e19c84a82094c9d44cbae42b960a25f5eb51a3e44e1"),
      right: asset("room_vnext_full_wave_universal_ceiling_light_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/right_body.png"), "2ec30c755895a2ee545c4ad15ba0ce38615015b1cb6097192cdee5a6c7c68513"),
      back: asset("room_vnext_full_wave_universal_ceiling_light_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/back_body.png"), "a7edcf921c3b5dfe776ba3c9d03407f1f012622f2a0695f287d87c21f34ab4ea"),
      left: asset("room_vnext_full_wave_universal_ceiling_light_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/left_body.png"), "02c78e3bce9d8d1ab24eef38807b9545e1831cd25b22418b1ac53c3b2a4144f1"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_ceiling_light_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/front_contact_shadow.png"), "234d80d7368722da78c9ab57a2b4744d2760d26f12ecba8b6a1e8d16e4931450"),
      right: asset("room_vnext_full_wave_universal_ceiling_light_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/right_contact_shadow.png"), "5d325c0f073a61bc9231a7d7325cb1e17d68f7c3411c8bedde503f3275d568cb"),
      back: asset("room_vnext_full_wave_universal_ceiling_light_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/back_contact_shadow.png"), "02f3f912c51d72a7e8c6f0143faa39aa88566e8d9c775520e4358a4154863249"),
      left: asset("room_vnext_full_wave_universal_ceiling_light_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/left_contact_shadow.png"), "cb583b324acfc7923c4a99ecc7e0ac42e60e4d8f63bc1612e2c785db43eeff86"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_ceiling_light_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_ceiling_light_a/front_thumbnail.png"), "3e3cc005f7f25366da506cfb91f4f18fde9e4c68a28ca78e141cfe60b22a6d68"),
  },
  "universal_curtain_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/front_body.png"), "6c1adfd9e8772c2e25a172cc17c985d7d21bf986f152bbfc6eef974a49d35a44"),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/right_body.png"), "bbfc9184540e60b2f07d3d842fc583ab799daa12c71d6c473c6f8ee88b1149c0"),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/back_body.png"), "67ae35d12ae100b8c926fa9c89ea1610af4094a290c178ace8ae441945ae6771"),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/left_body.png"), "a20f1257e3ab3520ed542eb061ebe7628710a933c77557a0d95fbb1f5b2763f4"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/front_contact_shadow.png"), "a46a52761f933043fd1a01faaacb531b50926085e7495c747f830e170b1b376c"),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/right_contact_shadow.png"), "9ab63d5a0fec1e904c1dab9c229751195f7fc573194666e39bd14bb6b0a28954"),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/back_contact_shadow.png"), "ea912e1fc85300af3842cd333c9a71eb77d5ee58ba5f83445644054fb0109192"),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/left_contact_shadow.png"), "8dfe91e9794552164beeec63d4647d273899e15e245f7a51e8ea21f4d0b79da4"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_curtain_set_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_curtain_set_a/front_thumbnail.png"), "a6e37e78fcd687e6966f555e2648cf8a2ce57700512bd28aecd11fe4347810e4"),
  },
  "universal_decorative_object_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/front_body.png"), "6cfcc2702b31e8cf55e520423a91d4a66e9429d0f23cec98027e99d027806a41"),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/right_body.png"), "d79e4d16f48ede2052dadc8ac49a336c8624e7637c458e7f772d026b159dce5c"),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/back_body.png"), "ab0685289329a76e3713621a8cfceee7c4f97378fe31cdef08693796e0a40f8f"),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/left_body.png"), "405dab49b427c6ef5b7f6fdbb8fecaf06902a506e97461c4bc12c3921438537e"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/front_contact_shadow.png"), "dd792f26469d9c1b53e14fc4d7e73469096414bcf6fd031d077a2656fbda2b0a"),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/right_contact_shadow.png"), "318ae344a87e658f49c083912761587ac38ea63544430f9d1262f16f79485826"),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/back_contact_shadow.png"), "1b7e3e5ed87da35e62cb3ff1fee9f122013346e9f6ebd2df2083161d7909aae7"),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/left_contact_shadow.png"), "c9e00c4309afa46a8fbcc0984c7a23c63ddb59b47e6b717eb9b1b1a3a7d3f3d8"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_decorative_object_set_a/front_thumbnail.png"), "4279afb4bf2697995c5468351cdde539f87a407fa34c72162f0c2156b7ef5805"),
  },
  "universal_small_speaker_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/front_body.png"), "d92ebac0eecf707ddefa6f0f3b132f5853a2dc33a343d678ad4de57fba8ea1d3"),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/right_body.png"), "047585877442f2ecca651b1083467f3653d3667ff95aa4bfee22fae77b0c3188"),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/back_body.png"), "b71b93f32acd4366b66a6cdc97c2f5d1197acde30480d5ed36380f5efb9d5015"),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/left_body.png"), "a039612092b74721df45d5c877a144c8359869471682892b3dc2f16f582d4f98"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/front_contact_shadow.png"), "25ed3c09c7d557e1559874ca654e440e6c3dfc63ab7193c28350c89d152fd488"),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/right_contact_shadow.png"), "0e71f248367469c1ec5cbd2f2dcf5c64a7c5d061748f295963532ad9086659e1"),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/back_contact_shadow.png"), "56ec1c61a891fca30d47911abfcb6d5d08130b63a9e4188bb4501f2ab3764b8e"),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/left_contact_shadow.png"), "6d61d562b0b9f681cc30fb7080cd2a971c8ea9ee7eb7076a92c8b9a7430be931"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_small_speaker_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_small_speaker_a/front_thumbnail.png"), "32a6cb8e169176485d078299bebb991bd0efe89082113c46652fee14ba834186"),
  },
  "universal_rug_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_rug_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/front_body.png"), "9fed5920820fa222313e89c8592d26f8336aea47ce848350036b7a1bc9899592"),
      right: asset("room_vnext_full_wave_universal_rug_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/right_body.png"), "373dd42bd306835513f5f333af7af819f3752cb8cab699640f5ca727ac4297ae"),
      back: asset("room_vnext_full_wave_universal_rug_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/back_body.png"), "db6f311e7524faec0c0b2e402ecf737aff6624e308098d13068e27c28028cfa5"),
      left: asset("room_vnext_full_wave_universal_rug_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/left_body.png"), "4e4cb5cdc005f8a6e20014d916e4813a8f0887fd1f9263c2288b318fb6ce4b3a"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_rug_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/front_contact_shadow.png"), "700a3c7c064afe56ecbbcf3e0c6f1c19a675c8e9088cf5561ab87c826542f57d"),
      right: asset("room_vnext_full_wave_universal_rug_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/right_contact_shadow.png"), "700a3c7c064afe56ecbbcf3e0c6f1c19a675c8e9088cf5561ab87c826542f57d"),
      back: asset("room_vnext_full_wave_universal_rug_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/back_contact_shadow.png"), "700a3c7c064afe56ecbbcf3e0c6f1c19a675c8e9088cf5561ab87c826542f57d"),
      left: asset("room_vnext_full_wave_universal_rug_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/left_contact_shadow.png"), "700a3c7c064afe56ecbbcf3e0c6f1c19a675c8e9088cf5561ab87c826542f57d"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_rug_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_rug_a/front_thumbnail.png"), "9d6999019d912a5eaa779f14e6937f87fdc4fa3804b417be40ac366c453205ba"),
  },
  "universal_full_length_mirror_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/front_body.png"), "99d3b011277aec5102904b9bb4167be9532cc57eef7d8e4ff4e1f6dd526aa822"),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/right_body.png"), "fae67f1a9e520d80b9a530371fb432fc06216af53f1c98dfb02f36baadd17487"),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/back_body.png"), "c8956a0287bc051e113feadba20b937cbf2bd2dddd84c3cf9385f27d42faba31"),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/left_body.png"), "7ae9cc7d4029c949a67afc28e300e01f4aa7e10ca5176e1f809d92554296d21f"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/front_contact_shadow.png"), "0b9a6f79aa2d49648dfc7025fd9e31b48368d31ab32e2c765f141edf9b15f716"),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/right_contact_shadow.png"), "6ecd41f1bbe3351fbe19bc9d3f1468dc1af475b909f5849ed4c29951dfe9c345"),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/back_contact_shadow.png"), "9b5ef7721f02fb469106f4bf41743733da72b5debf9e6e3d50155030a45c0036"),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/left_contact_shadow.png"), "943393673a42f44e5d67b9bb1db61e92ade760ce9f1cb24116884cd71f2956ba"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_full_length_mirror_a/front_thumbnail.png"), "87a62fbabbf4a9aaa5433af8b73fc7bb3ace231732796f5206080f455050c7a8"),
  },
  "universal_open_display_shelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/front_body.png"), "229b149f9bfa5a23c386df0d137a50e2b6f3f151a82df77a96c6e523bbe90dff"),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/right_body.png"), "a6c16780f5a1aee38192f6a84855b597f1ad8a4f556e716301d5629bce0f9f63"),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/back_body.png"), "c864310296ab82cac3a8656572884359f7a6a6d51db49aaad562540d30c722fd"),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/left_body.png"), "93aef74a70699482fe924108ae4da364cb62df7277d66e6b5dcacb2d858abe8f"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/front_contact_shadow.png"), "ea67cf89bf9299e00f82cfd935fb726671211c8707d10017df5d21a93d7e129d"),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/right_contact_shadow.png"), "884abbf349c394305353e1347b47dbc6e3a986987bc10c817a9c88f0cfeb608a"),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/back_contact_shadow.png"), "460b3472be8b9216594d8bbc580f8751adb1830d7c9968eff8be55fd5e9fca0b"),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/left_contact_shadow.png"), "71f4114a73c15b88ac2d10df59929afebb4ae390cffb9f33de70ddd80eb0f72d"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_open_display_shelf_a/front_thumbnail.png"), "fe78dd7968bdbb901c156b00b169eaa0e6423e9485407b105a5e5f767a72d443"),
  },
  "universal_room_divider_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/front_body.png"), "e82de3ad9fe9b8b47f75cf220470332028027f3d8171b77bc390d62598372edb"),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/right_body.png"), "6397b1c2acb93b6f7cefb1ce4508d9872cd8e98fefc8d54a209528d9769adc9e"),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/back_body.png"), "1121090ca44ce61902d639fecdb84bbdba4ecff38829080abb3e143725ba9c3c"),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_body_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/left_body.png"), "d8ff9be4d1a936c8d9c3c675e32602dfdc99bd61b10afdd3c510933559c6ffea"),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/front_contact_shadow.png"), "31c6505a1064a879444dcc11232ad42ebbd6cef54d0064467613060071eb8bf8"),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/right_contact_shadow.png"), "1ddfdadbaf383c1a54499a981a010aa8845841a57e07d46dd8a4e8a786d7b8cd"),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/back_contact_shadow.png"), "4ad48c13be4c4d09ec360d4a32a01350e40f293f2f3143634fb6cf163fc48eef"),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_shadow_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/left_contact_shadow.png"), "49ddbcbecae789395351a0aa498d1807e2789f80ac79ced183021e6a94d07d68"),
    },
    thumbnail: asset("room_vnext_full_wave_universal_room_divider_a_front_thumbnail_v3", require("./assets/runtime/room-vnext/full-wave-v3-cute45-v3/universal_room_divider_a/front_thumbnail.png"), "6a458f7edb1db74840024738037d4ff51d6df62f4c40ced3b7385d53d53340b7"),
  },
} as const
