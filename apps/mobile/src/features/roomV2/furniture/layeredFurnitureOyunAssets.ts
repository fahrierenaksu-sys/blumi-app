import type { LayeredFurnitureAssets } from "./layeredFurniture"
import type { LayeredWallAssets } from "./layeredWallFurniture"

/**
 * The Oyun Odası collection's runtime art (Workbench `avatar25-v2/furniture/batch_oyun/<id>/item/`), bundled only by
 * the 2.5D module, in the same form as the Japon collection (`layeredFurnitureJaponAssets.ts`): world
 * scale D, sprite scale 2.0, the visible pixels verbatim (fully transparent pixels' colour zeroed by
 * `scripts/normalize-transparent-png-rgb.mjs`, then losslessly recompressed). A front layer is bundled only where a
 * drawn seat (`sit_chair`) is covered and it has pixels: the poufs (chair height since 2026-10-17) bundle their ears
 * (and the bear's near tail) as the front layer of the two rotations seen from behind. Rugs bundle their back layer
 * only; the posters bundle one drawing per back wall (right = rotation 0, left = rotation 1). Not owner-approved. Asset keys are per item and rotation.
 */
const art = (itemId: string, key: string, source: number) => ({ key: `${itemId}_layered_${key}`, source })

export const OYUN_LAYERED_FURNITURE_ASSETS: LayeredFurnitureAssets = {
  room_v3_bed_oyun_gingham: {
    0: {
      back: art("room_v3_bed_oyun_gingham", "r0_back", require("./room_v3_bed_oyun_gingham/r0_back.png")),
      shadow: art("room_v3_bed_oyun_gingham", "r0_shadow", require("./room_v3_bed_oyun_gingham/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_bed_oyun_gingham", "r1_back", require("./room_v3_bed_oyun_gingham/r1_back.png")),
      shadow: art("room_v3_bed_oyun_gingham", "r1_shadow", require("./room_v3_bed_oyun_gingham/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_bed_oyun_gingham", "r2_back", require("./room_v3_bed_oyun_gingham/r2_back.png")),
      shadow: art("room_v3_bed_oyun_gingham", "r2_shadow", require("./room_v3_bed_oyun_gingham/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_bed_oyun_gingham", "r3_back", require("./room_v3_bed_oyun_gingham/r3_back.png")),
      shadow: art("room_v3_bed_oyun_gingham", "r3_shadow", require("./room_v3_bed_oyun_gingham/r3_shadow.png"))
    }
  },
  room_v3_bookshelf_oyun_cream: {
    0: {
      back: art("room_v3_bookshelf_oyun_cream", "r0_back", require("./room_v3_bookshelf_oyun_cream/r0_back.png")),
      shadow: art("room_v3_bookshelf_oyun_cream", "r0_shadow", require("./room_v3_bookshelf_oyun_cream/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_bookshelf_oyun_cream", "r1_back", require("./room_v3_bookshelf_oyun_cream/r1_back.png")),
      shadow: art("room_v3_bookshelf_oyun_cream", "r1_shadow", require("./room_v3_bookshelf_oyun_cream/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_bookshelf_oyun_cream", "r2_back", require("./room_v3_bookshelf_oyun_cream/r2_back.png")),
      shadow: art("room_v3_bookshelf_oyun_cream", "r2_shadow", require("./room_v3_bookshelf_oyun_cream/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_bookshelf_oyun_cream", "r3_back", require("./room_v3_bookshelf_oyun_cream/r3_back.png")),
      shadow: art("room_v3_bookshelf_oyun_cream", "r3_shadow", require("./room_v3_bookshelf_oyun_cream/r3_shadow.png"))
    }
  },
  room_v3_dresser_oyun_honey: {
    0: {
      back: art("room_v3_dresser_oyun_honey", "r0_back", require("./room_v3_dresser_oyun_honey/r0_back.png")),
      shadow: art("room_v3_dresser_oyun_honey", "r0_shadow", require("./room_v3_dresser_oyun_honey/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_dresser_oyun_honey", "r1_back", require("./room_v3_dresser_oyun_honey/r1_back.png")),
      shadow: art("room_v3_dresser_oyun_honey", "r1_shadow", require("./room_v3_dresser_oyun_honey/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_dresser_oyun_honey", "r2_back", require("./room_v3_dresser_oyun_honey/r2_back.png")),
      shadow: art("room_v3_dresser_oyun_honey", "r2_shadow", require("./room_v3_dresser_oyun_honey/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_dresser_oyun_honey", "r3_back", require("./room_v3_dresser_oyun_honey/r3_back.png")),
      shadow: art("room_v3_dresser_oyun_honey", "r3_shadow", require("./room_v3_dresser_oyun_honey/r3_shadow.png"))
    }
  },
  room_v3_nightstand_oyun_honey: {
    0: {
      back: art("room_v3_nightstand_oyun_honey", "r0_back", require("./room_v3_nightstand_oyun_honey/r0_back.png")),
      shadow: art("room_v3_nightstand_oyun_honey", "r0_shadow", require("./room_v3_nightstand_oyun_honey/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_nightstand_oyun_honey", "r1_back", require("./room_v3_nightstand_oyun_honey/r1_back.png")),
      shadow: art("room_v3_nightstand_oyun_honey", "r1_shadow", require("./room_v3_nightstand_oyun_honey/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_nightstand_oyun_honey", "r2_back", require("./room_v3_nightstand_oyun_honey/r2_back.png")),
      shadow: art("room_v3_nightstand_oyun_honey", "r2_shadow", require("./room_v3_nightstand_oyun_honey/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_nightstand_oyun_honey", "r3_back", require("./room_v3_nightstand_oyun_honey/r3_back.png")),
      shadow: art("room_v3_nightstand_oyun_honey", "r3_shadow", require("./room_v3_nightstand_oyun_honey/r3_shadow.png"))
    }
  },
  room_v3_snacktable_oyun_round: {
    0: {
      back: art("room_v3_snacktable_oyun_round", "r0_back", require("./room_v3_snacktable_oyun_round/r0_back.png")),
      shadow: art("room_v3_snacktable_oyun_round", "r0_shadow", require("./room_v3_snacktable_oyun_round/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_snacktable_oyun_round", "r1_back", require("./room_v3_snacktable_oyun_round/r1_back.png")),
      shadow: art("room_v3_snacktable_oyun_round", "r1_shadow", require("./room_v3_snacktable_oyun_round/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_snacktable_oyun_round", "r2_back", require("./room_v3_snacktable_oyun_round/r2_back.png")),
      shadow: art("room_v3_snacktable_oyun_round", "r2_shadow", require("./room_v3_snacktable_oyun_round/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_snacktable_oyun_round", "r3_back", require("./room_v3_snacktable_oyun_round/r3_back.png")),
      shadow: art("room_v3_snacktable_oyun_round", "r3_shadow", require("./room_v3_snacktable_oyun_round/r3_shadow.png"))
    }
  },
  room_v3_teaset_oyun_flower: {
    0: {
      back: art("room_v3_teaset_oyun_flower", "r0_back", require("./room_v3_teaset_oyun_flower/r0_back.png")),
      front: art("room_v3_teaset_oyun_flower", "r0_front", require("./room_v3_teaset_oyun_flower/r0_front.png")),
      shadow: art("room_v3_teaset_oyun_flower", "r0_shadow", require("./room_v3_teaset_oyun_flower/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_teaset_oyun_flower", "r1_back", require("./room_v3_teaset_oyun_flower/r1_back.png")),
      front: art("room_v3_teaset_oyun_flower", "r1_front", require("./room_v3_teaset_oyun_flower/r1_front.png")),
      shadow: art("room_v3_teaset_oyun_flower", "r1_shadow", require("./room_v3_teaset_oyun_flower/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_teaset_oyun_flower", "r2_back", require("./room_v3_teaset_oyun_flower/r2_back.png")),
      front: art("room_v3_teaset_oyun_flower", "r2_front", require("./room_v3_teaset_oyun_flower/r2_front.png")),
      shadow: art("room_v3_teaset_oyun_flower", "r2_shadow", require("./room_v3_teaset_oyun_flower/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_teaset_oyun_flower", "r3_back", require("./room_v3_teaset_oyun_flower/r3_back.png")),
      front: art("room_v3_teaset_oyun_flower", "r3_front", require("./room_v3_teaset_oyun_flower/r3_front.png")),
      shadow: art("room_v3_teaset_oyun_flower", "r3_shadow", require("./room_v3_teaset_oyun_flower/r3_shadow.png"))
    }
  },
  room_v3_tvunit_oyun_game: {
    0: {
      back: art("room_v3_tvunit_oyun_game", "r0_back", require("./room_v3_tvunit_oyun_game/r0_back.png")),
      shadow: art("room_v3_tvunit_oyun_game", "r0_shadow", require("./room_v3_tvunit_oyun_game/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_tvunit_oyun_game", "r1_back", require("./room_v3_tvunit_oyun_game/r1_back.png")),
      shadow: art("room_v3_tvunit_oyun_game", "r1_shadow", require("./room_v3_tvunit_oyun_game/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_tvunit_oyun_game", "r2_back", require("./room_v3_tvunit_oyun_game/r2_back.png")),
      shadow: art("room_v3_tvunit_oyun_game", "r2_shadow", require("./room_v3_tvunit_oyun_game/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_tvunit_oyun_game", "r3_back", require("./room_v3_tvunit_oyun_game/r3_back.png")),
      shadow: art("room_v3_tvunit_oyun_game", "r3_shadow", require("./room_v3_tvunit_oyun_game/r3_shadow.png"))
    }
  },
  room_v3_pouf_oyun_bunnypink: {
    0: {
      back: art("room_v3_pouf_oyun_bunnypink", "r0_back", require("./room_v3_pouf_oyun_bunnypink/r0_back.png")),
      front: art("room_v3_pouf_oyun_bunnypink", "r0_front", require("./room_v3_pouf_oyun_bunnypink/r0_front.png")),
      shadow: art("room_v3_pouf_oyun_bunnypink", "r0_shadow", require("./room_v3_pouf_oyun_bunnypink/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_pouf_oyun_bunnypink", "r1_back", require("./room_v3_pouf_oyun_bunnypink/r1_back.png")),
      front: art("room_v3_pouf_oyun_bunnypink", "r1_front", require("./room_v3_pouf_oyun_bunnypink/r1_front.png")),
      shadow: art("room_v3_pouf_oyun_bunnypink", "r1_shadow", require("./room_v3_pouf_oyun_bunnypink/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_pouf_oyun_bunnypink", "r2_back", require("./room_v3_pouf_oyun_bunnypink/r2_back.png")),
      shadow: art("room_v3_pouf_oyun_bunnypink", "r2_shadow", require("./room_v3_pouf_oyun_bunnypink/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_pouf_oyun_bunnypink", "r3_back", require("./room_v3_pouf_oyun_bunnypink/r3_back.png")),
      shadow: art("room_v3_pouf_oyun_bunnypink", "r3_shadow", require("./room_v3_pouf_oyun_bunnypink/r3_shadow.png"))
    }
  },
  room_v3_pouf_oyun_bearpurple: {
    0: {
      back: art("room_v3_pouf_oyun_bearpurple", "r0_back", require("./room_v3_pouf_oyun_bearpurple/r0_back.png")),
      front: art("room_v3_pouf_oyun_bearpurple", "r0_front", require("./room_v3_pouf_oyun_bearpurple/r0_front.png")),
      shadow: art("room_v3_pouf_oyun_bearpurple", "r0_shadow", require("./room_v3_pouf_oyun_bearpurple/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_pouf_oyun_bearpurple", "r1_back", require("./room_v3_pouf_oyun_bearpurple/r1_back.png")),
      front: art("room_v3_pouf_oyun_bearpurple", "r1_front", require("./room_v3_pouf_oyun_bearpurple/r1_front.png")),
      shadow: art("room_v3_pouf_oyun_bearpurple", "r1_shadow", require("./room_v3_pouf_oyun_bearpurple/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_pouf_oyun_bearpurple", "r2_back", require("./room_v3_pouf_oyun_bearpurple/r2_back.png")),
      shadow: art("room_v3_pouf_oyun_bearpurple", "r2_shadow", require("./room_v3_pouf_oyun_bearpurple/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_pouf_oyun_bearpurple", "r3_back", require("./room_v3_pouf_oyun_bearpurple/r3_back.png")),
      shadow: art("room_v3_pouf_oyun_bearpurple", "r3_shadow", require("./room_v3_pouf_oyun_bearpurple/r3_shadow.png"))
    }
  },
  room_v3_rug_oyun_checker: {
    0: {
      back: art("room_v3_rug_oyun_checker", "r0_back", require("./room_v3_rug_oyun_checker/r0_back.png"))
    },
    1: {
      back: art("room_v3_rug_oyun_checker", "r1_back", require("./room_v3_rug_oyun_checker/r1_back.png"))
    },
    2: {
      back: art("room_v3_rug_oyun_checker", "r2_back", require("./room_v3_rug_oyun_checker/r2_back.png"))
    },
    3: {
      back: art("room_v3_rug_oyun_checker", "r3_back", require("./room_v3_rug_oyun_checker/r3_back.png"))
    }
  },
  room_v3_rug_oyun_cloud: {
    0: {
      back: art("room_v3_rug_oyun_cloud", "r0_back", require("./room_v3_rug_oyun_cloud/r0_back.png"))
    },
    1: {
      back: art("room_v3_rug_oyun_cloud", "r1_back", require("./room_v3_rug_oyun_cloud/r1_back.png"))
    },
    2: {
      back: art("room_v3_rug_oyun_cloud", "r2_back", require("./room_v3_rug_oyun_cloud/r2_back.png"))
    },
    3: {
      back: art("room_v3_rug_oyun_cloud", "r3_back", require("./room_v3_rug_oyun_cloud/r3_back.png"))
    }
  },
  room_v3_rug_oyun_tea: {
    0: {
      back: art("room_v3_rug_oyun_tea", "r0_back", require("./room_v3_rug_oyun_tea/r0_back.png"))
    },
    1: {
      back: art("room_v3_rug_oyun_tea", "r1_back", require("./room_v3_rug_oyun_tea/r1_back.png"))
    },
    2: {
      back: art("room_v3_rug_oyun_tea", "r2_back", require("./room_v3_rug_oyun_tea/r2_back.png"))
    },
    3: {
      back: art("room_v3_rug_oyun_tea", "r3_back", require("./room_v3_rug_oyun_tea/r3_back.png"))
    }
  }
}

/** The wall posters: one drawing per back wall. */
export const OYUN_LAYERED_WALL_ASSETS: LayeredWallAssets = {
  room_v3_poster_oyun_bunny: {
    left: {
      back: art("room_v3_poster_oyun_bunny", "left_back", require("./room_v3_poster_oyun_bunny/left_back.png")),
      shadow: art("room_v3_poster_oyun_bunny", "left_shadow", require("./room_v3_poster_oyun_bunny/left_shadow.png"))
    },
    right: {
      back: art("room_v3_poster_oyun_bunny", "right_back", require("./room_v3_poster_oyun_bunny/right_back.png")),
      shadow: art("room_v3_poster_oyun_bunny", "right_shadow", require("./room_v3_poster_oyun_bunny/right_shadow.png"))
    }
  },
  room_v3_poster_oyun_controller: {
    left: {
      back: art("room_v3_poster_oyun_controller", "left_back", require("./room_v3_poster_oyun_controller/left_back.png")),
      shadow: art("room_v3_poster_oyun_controller", "left_shadow", require("./room_v3_poster_oyun_controller/left_shadow.png"))
    },
    right: {
      back: art("room_v3_poster_oyun_controller", "right_back", require("./room_v3_poster_oyun_controller/right_back.png")),
      shadow: art("room_v3_poster_oyun_controller", "right_shadow", require("./room_v3_poster_oyun_controller/right_shadow.png"))
    }
  }
}
