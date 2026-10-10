import type { LayeredFurnitureAssets } from "./layeredFurniture"
import type { LayeredWallAssets } from "./layeredWallFurniture"

/**
 * The Japon Sadeliği collection's runtime art (Workbench `avatar25-v2/furniture/batch_japon/<id>/item/`), bundled only
 * by the 2.5D module. World scale D, sprite scale 2.0; the visible pixels verbatim (fully transparent
 * pixels' colour zeroed by `scripts/normalize-transparent-png-rgb.mjs`, then losslessly recompressed). Only the
 * layers the room draws are bundled: a front layer where a seated avatar is covered and it has pixels, a shadow
 * where the piece casts one; the round coffee table looks the same from every side, so one drawing serves all four.
 * The tea set's zaisu seats (`sit_low`) and the TV unit are in too; the tea set's seats are pose-pending, so it bundles no front layers.
 * Not owner-approved. Asset keys are per item and rotation (tap outlines find them).
 */
const art = (itemId: string, key: string, source: number) => ({ key: `${itemId}_layered_${key}`, source })

export const JAPON_LAYERED_FURNITURE_ASSETS: LayeredFurnitureAssets = {
  room_v3_armchair_japon_cream: {
    0: {
      back: art("room_v3_armchair_japon_cream", "r0_back", require("./room_v3_armchair_japon_cream/r0_back.png")),
      front: art("room_v3_armchair_japon_cream", "r0_front", require("./room_v3_armchair_japon_cream/r0_front.png")),
      shadow: art("room_v3_armchair_japon_cream", "r0_shadow", require("./room_v3_armchair_japon_cream/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_armchair_japon_cream", "r1_back", require("./room_v3_armchair_japon_cream/r1_back.png")),
      front: art("room_v3_armchair_japon_cream", "r1_front", require("./room_v3_armchair_japon_cream/r1_front.png")),
      shadow: art("room_v3_armchair_japon_cream", "r1_shadow", require("./room_v3_armchair_japon_cream/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_armchair_japon_cream", "r2_back", require("./room_v3_armchair_japon_cream/r2_back.png")),
      front: art("room_v3_armchair_japon_cream", "r2_front", require("./room_v3_armchair_japon_cream/r2_front.png")),
      shadow: art("room_v3_armchair_japon_cream", "r2_shadow", require("./room_v3_armchair_japon_cream/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_armchair_japon_cream", "r3_back", require("./room_v3_armchair_japon_cream/r3_back.png")),
      front: art("room_v3_armchair_japon_cream", "r3_front", require("./room_v3_armchair_japon_cream/r3_front.png")),
      shadow: art("room_v3_armchair_japon_cream", "r3_shadow", require("./room_v3_armchair_japon_cream/r3_shadow.png"))
    }
  },
  room_v3_bed_japon_sakura: {
    0: {
      back: art("room_v3_bed_japon_sakura", "r0_back", require("./room_v3_bed_japon_sakura/r0_back.png")),
      shadow: art("room_v3_bed_japon_sakura", "r0_shadow", require("./room_v3_bed_japon_sakura/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_bed_japon_sakura", "r1_back", require("./room_v3_bed_japon_sakura/r1_back.png")),
      front: art("room_v3_bed_japon_sakura", "r1_front", require("./room_v3_bed_japon_sakura/r1_front.png")),
      shadow: art("room_v3_bed_japon_sakura", "r1_shadow", require("./room_v3_bed_japon_sakura/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_bed_japon_sakura", "r2_back", require("./room_v3_bed_japon_sakura/r2_back.png")),
      front: art("room_v3_bed_japon_sakura", "r2_front", require("./room_v3_bed_japon_sakura/r2_front.png")),
      shadow: art("room_v3_bed_japon_sakura", "r2_shadow", require("./room_v3_bed_japon_sakura/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_bed_japon_sakura", "r3_back", require("./room_v3_bed_japon_sakura/r3_back.png")),
      front: art("room_v3_bed_japon_sakura", "r3_front", require("./room_v3_bed_japon_sakura/r3_front.png")),
      shadow: art("room_v3_bed_japon_sakura", "r3_shadow", require("./room_v3_bed_japon_sakura/r3_shadow.png"))
    }
  },
  room_v3_bookshelf_japon_rattan: {
    0: {
      back: art("room_v3_bookshelf_japon_rattan", "r0_back", require("./room_v3_bookshelf_japon_rattan/r0_back.png")),
      shadow: art("room_v3_bookshelf_japon_rattan", "r0_shadow", require("./room_v3_bookshelf_japon_rattan/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_bookshelf_japon_rattan", "r1_back", require("./room_v3_bookshelf_japon_rattan/r1_back.png")),
      shadow: art("room_v3_bookshelf_japon_rattan", "r1_shadow", require("./room_v3_bookshelf_japon_rattan/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_bookshelf_japon_rattan", "r2_back", require("./room_v3_bookshelf_japon_rattan/r2_back.png")),
      shadow: art("room_v3_bookshelf_japon_rattan", "r2_shadow", require("./room_v3_bookshelf_japon_rattan/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_bookshelf_japon_rattan", "r3_back", require("./room_v3_bookshelf_japon_rattan/r3_back.png")),
      shadow: art("room_v3_bookshelf_japon_rattan", "r3_shadow", require("./room_v3_bookshelf_japon_rattan/r3_shadow.png"))
    }
  },
  room_v3_clothesrack_japon_bamboo: {
    0: {
      back: art("room_v3_clothesrack_japon_bamboo", "r0_back", require("./room_v3_clothesrack_japon_bamboo/r0_back.png")),
      shadow: art("room_v3_clothesrack_japon_bamboo", "r0_shadow", require("./room_v3_clothesrack_japon_bamboo/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_clothesrack_japon_bamboo", "r1_back", require("./room_v3_clothesrack_japon_bamboo/r1_back.png")),
      shadow: art("room_v3_clothesrack_japon_bamboo", "r1_shadow", require("./room_v3_clothesrack_japon_bamboo/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_clothesrack_japon_bamboo", "r2_back", require("./room_v3_clothesrack_japon_bamboo/r2_back.png")),
      shadow: art("room_v3_clothesrack_japon_bamboo", "r2_shadow", require("./room_v3_clothesrack_japon_bamboo/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_clothesrack_japon_bamboo", "r3_back", require("./room_v3_clothesrack_japon_bamboo/r3_back.png")),
      shadow: art("room_v3_clothesrack_japon_bamboo", "r3_shadow", require("./room_v3_clothesrack_japon_bamboo/r3_shadow.png"))
    }
  },
  room_v3_coffeetable_japon_round: {
    0: {
      back: art("room_v3_coffeetable_japon_round", "r0_back", require("./room_v3_coffeetable_japon_round/r0_back.png")),
      shadow: art("room_v3_coffeetable_japon_round", "r0_shadow", require("./room_v3_coffeetable_japon_round/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_coffeetable_japon_round", "r1_back", require("./room_v3_coffeetable_japon_round/r0_back.png")),
      shadow: art("room_v3_coffeetable_japon_round", "r1_shadow", require("./room_v3_coffeetable_japon_round/r0_shadow.png"))
    },
    2: {
      back: art("room_v3_coffeetable_japon_round", "r2_back", require("./room_v3_coffeetable_japon_round/r0_back.png")),
      shadow: art("room_v3_coffeetable_japon_round", "r2_shadow", require("./room_v3_coffeetable_japon_round/r0_shadow.png"))
    },
    3: {
      back: art("room_v3_coffeetable_japon_round", "r3_back", require("./room_v3_coffeetable_japon_round/r0_back.png")),
      shadow: art("room_v3_coffeetable_japon_round", "r3_shadow", require("./room_v3_coffeetable_japon_round/r0_shadow.png"))
    }
  },
  room_v3_nightstand_japon_cedar: {
    0: {
      back: art("room_v3_nightstand_japon_cedar", "r0_back", require("./room_v3_nightstand_japon_cedar/r0_back.png")),
      shadow: art("room_v3_nightstand_japon_cedar", "r0_shadow", require("./room_v3_nightstand_japon_cedar/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_nightstand_japon_cedar", "r1_back", require("./room_v3_nightstand_japon_cedar/r1_back.png")),
      shadow: art("room_v3_nightstand_japon_cedar", "r1_shadow", require("./room_v3_nightstand_japon_cedar/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_nightstand_japon_cedar", "r2_back", require("./room_v3_nightstand_japon_cedar/r2_back.png")),
      shadow: art("room_v3_nightstand_japon_cedar", "r2_shadow", require("./room_v3_nightstand_japon_cedar/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_nightstand_japon_cedar", "r3_back", require("./room_v3_nightstand_japon_cedar/r3_back.png")),
      shadow: art("room_v3_nightstand_japon_cedar", "r3_shadow", require("./room_v3_nightstand_japon_cedar/r3_shadow.png"))
    }
  },
  room_v3_teaset_japon_zaisu: {
    0: {
      back: art("room_v3_teaset_japon_zaisu", "r0_back", require("./room_v3_teaset_japon_zaisu/r0_back.png")),
      shadow: art("room_v3_teaset_japon_zaisu", "r0_shadow", require("./room_v3_teaset_japon_zaisu/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_teaset_japon_zaisu", "r1_back", require("./room_v3_teaset_japon_zaisu/r1_back.png")),
      shadow: art("room_v3_teaset_japon_zaisu", "r1_shadow", require("./room_v3_teaset_japon_zaisu/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_teaset_japon_zaisu", "r2_back", require("./room_v3_teaset_japon_zaisu/r2_back.png")),
      shadow: art("room_v3_teaset_japon_zaisu", "r2_shadow", require("./room_v3_teaset_japon_zaisu/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_teaset_japon_zaisu", "r3_back", require("./room_v3_teaset_japon_zaisu/r3_back.png")),
      shadow: art("room_v3_teaset_japon_zaisu", "r3_shadow", require("./room_v3_teaset_japon_zaisu/r3_shadow.png"))
    }
  },
  room_v3_tvunit_japon_rattan: {
    0: {
      back: art("room_v3_tvunit_japon_rattan", "r0_back", require("./room_v3_tvunit_japon_rattan/r0_back.png")),
      shadow: art("room_v3_tvunit_japon_rattan", "r0_shadow", require("./room_v3_tvunit_japon_rattan/r0_shadow.png"))
    },
    1: {
      back: art("room_v3_tvunit_japon_rattan", "r1_back", require("./room_v3_tvunit_japon_rattan/r1_back.png")),
      shadow: art("room_v3_tvunit_japon_rattan", "r1_shadow", require("./room_v3_tvunit_japon_rattan/r1_shadow.png"))
    },
    2: {
      back: art("room_v3_tvunit_japon_rattan", "r2_back", require("./room_v3_tvunit_japon_rattan/r2_back.png")),
      shadow: art("room_v3_tvunit_japon_rattan", "r2_shadow", require("./room_v3_tvunit_japon_rattan/r2_shadow.png"))
    },
    3: {
      back: art("room_v3_tvunit_japon_rattan", "r3_back", require("./room_v3_tvunit_japon_rattan/r3_back.png")),
      shadow: art("room_v3_tvunit_japon_rattan", "r3_shadow", require("./room_v3_tvunit_japon_rattan/r3_shadow.png"))
    }
  },
  room_v3_rug_japon_botanic: {
    0: {
      back: art("room_v3_rug_japon_botanic", "r0_back", require("./room_v3_rug_japon_botanic/r0_back.png"))
    },
    1: {
      back: art("room_v3_rug_japon_botanic", "r1_back", require("./room_v3_rug_japon_botanic/r1_back.png"))
    },
    2: {
      back: art("room_v3_rug_japon_botanic", "r2_back", require("./room_v3_rug_japon_botanic/r2_back.png"))
    },
    3: {
      back: art("room_v3_rug_japon_botanic", "r3_back", require("./room_v3_rug_japon_botanic/r3_back.png"))
    }
  },
  room_v3_rug_japon_tea: {
    0: {
      back: art("room_v3_rug_japon_tea", "r0_back", require("./room_v3_rug_japon_tea/r0_back.png"))
    },
    1: {
      back: art("room_v3_rug_japon_tea", "r1_back", require("./room_v3_rug_japon_tea/r1_back.png"))
    },
    2: {
      back: art("room_v3_rug_japon_tea", "r2_back", require("./room_v3_rug_japon_tea/r2_back.png"))
    },
    3: {
      back: art("room_v3_rug_japon_tea", "r3_back", require("./room_v3_rug_japon_tea/r3_back.png"))
    }
  }
}

/** The wall pieces: one drawing per back wall (`item.json` `wallVariants`: right = rotation 0, left = rotation 1). */
export const JAPON_LAYERED_WALL_ASSETS: LayeredWallAssets = {
  room_v3_clock_japon_flower: {
    left: {
      back: art("room_v3_clock_japon_flower", "left_back", require("./room_v3_clock_japon_flower/left_back.png")),
      shadow: art("room_v3_clock_japon_flower", "left_shadow", require("./room_v3_clock_japon_flower/left_shadow.png"))
    },
    right: {
      back: art("room_v3_clock_japon_flower", "right_back", require("./room_v3_clock_japon_flower/right_back.png")),
      shadow: art("room_v3_clock_japon_flower", "right_shadow", require("./room_v3_clock_japon_flower/right_shadow.png"))
    }
  },
  room_v3_frame_japon_sakura: {
    left: {
      back: art("room_v3_frame_japon_sakura", "left_back", require("./room_v3_frame_japon_sakura/left_back.png")),
      shadow: art("room_v3_frame_japon_sakura", "left_shadow", require("./room_v3_frame_japon_sakura/left_shadow.png"))
    },
    right: {
      back: art("room_v3_frame_japon_sakura", "right_back", require("./room_v3_frame_japon_sakura/right_back.png")),
      shadow: art("room_v3_frame_japon_sakura", "right_shadow", require("./room_v3_frame_japon_sakura/right_shadow.png"))
    }
  }
}
