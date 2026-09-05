import type {
  FurnitureInteractionType,
  RoomFurnitureRotation,
  RoomPlacementSurface
} from "./roomV2.types"

export type RoomV3CatalogDirection = "male" | "female" | "unisex"
export type RoomV3CatalogVariant = "a" | "b"
export type RoomV3PlacementRule =
  | "free_floor"
  | "wall_region"
  | "ceiling_region"
  | "tabletop_support"

export const ROOM_V3_CANONICAL_SHELL_LANGUAGE = [
  "soft_painterly",
  "warm_ambient",
  "rounded_friendly",
  "avatar_scale_consistent",
  "premium_material_depth"
] as const

export type RoomV3CanonicalShellLanguageTag =
  (typeof ROOM_V3_CANONICAL_SHELL_LANGUAGE)[number]

export interface RoomV3FurnitureCompatibilityPlan {
  requiredMaterialFamilies: readonly string[]
}

export interface RoomV3UniversalFurnitureCompatibilityPlan
  extends RoomV3FurnitureCompatibilityPlan {
  compatibleHomeIds: readonly string[]
  compatibleOptionalRoomDirectionIds: readonly string[]
  mobileReadabilityRules: readonly string[]
}

export type RoomV3ShellWall = "left" | "right"
export type RoomV3DoorHinge = "left" | "right"

export interface RoomV3ArchitecturalVariationPlan {
  door: {
    wall: RoomV3ShellWall
    hinge: RoomV3DoorHinge
    style: string
  }
  primaryWindow: {
    wall: RoomV3ShellWall
    style: string
  }
  floor: {
    material: string
    layout: string
  }
}

export interface RoomV3HomeCollectionPlan {
  id: string
  name: string
  catalogDirection: RoomV3CatalogDirection
  palette: readonly string[]
  materialDirection: string
  architecturalVariation: RoomV3ArchitecturalVariationPlan
  furnitureCompatibility: RoomV3FurnitureCompatibilityPlan
  requiredVisualLanguage: typeof ROOM_V3_CANONICAL_SHELL_LANGUAGE
}

export interface RoomV3OptionalRoomDirectionPlan {
  id: string
  name: string
  baseCollectionId: string
  palette: readonly string[]
  materialDirection: string
  furnitureCompatibility: RoomV3FurnitureCompatibilityPlan
  furnitureReadabilityRules: readonly string[]
  requiredVisualLanguage: typeof ROOM_V3_CANONICAL_SHELL_LANGUAGE
  productionStatus: "direction_only"
  runtimeEligible: false
  defaultSelection: false
}

export interface RoomV3FurnitureCategoryPlan {
  id: string
  name: string
  placementSurface: RoomPlacementSurface
  requiresDirectionalAssets: boolean
  interactionType: FurnitureInteractionType
  placementRule: RoomV3PlacementRule
}

export interface RoomV3CatalogManifestPlanEntry {
  id: string
  name: string
  homeTheme: string
  collectionId: string
  categoryId: string
  variant: RoomV3CatalogVariant
  placementSurface: RoomPlacementSurface
  interactionType: FurnitureInteractionType
  placementRule: RoomV3PlacementRule
  requiresDirectionalAssets: boolean
  directions: readonly RoomFurnitureRotation[]
  requiredMaterialFamilies: readonly string[]
  thumbnailKey: string
  productionStatus: "planned"
}

export interface RoomV3UniversalCoreManifestPlanEntry {
  id: string
  name: string
  collectionId: "universal_core"
  categoryId: string
  variant: RoomV3CatalogVariant
  placementSurface: RoomPlacementSurface
  interactionType: FurnitureInteractionType
  placementRule: RoomV3PlacementRule
  requiresDirectionalAssets: boolean
  directions: readonly RoomFurnitureRotation[]
  compatibleHomeIds: readonly string[]
  compatibleOptionalRoomDirectionIds: readonly string[]
  requiredMaterialFamilies: readonly string[]
  thumbnailKey: string
  productionStatus: "planned"
}

const ROOM_V3_VARIANTS: readonly RoomV3CatalogVariant[] = ["a", "b"]
// Universal Core is the active, room-neutral launch wave: one timeless item
// per category. A second variant is deliberately deferred until this complete
// 45-item set has real Room V2 evidence.
const ROOM_V3_UNIVERSAL_CORE_VARIANTS: readonly RoomV3CatalogVariant[] = ["a"]
const ROOM_V3_DIRECTIONAL_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]
const ROOM_V3_FRONT_ROTATION: readonly RoomFurnitureRotation[] = ["front"]

export const ROOM_V3_HOME_COLLECTIONS: readonly RoomV3HomeCollectionPlan[] = [
  {
    id: "cocoa_navy_modern_studio",
    name: "Cocoa Navy Modern Studio",
    catalogDirection: "male",
    palette: ["warm cocoa", "dusty navy", "cream", "soft amber"],
    materialDirection: "rounded walnut, woven textile, softly brushed metal",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "right",
        style: "dusty navy arched door with a warm brass fanlight rim"
      },
      primaryWindow: {
        wall: "left",
        style: "arched cream-glass fanlight with rounded cocoa mullions"
      },
      floor: {
        material: "cocoa walnut",
        layout: "wide_plank"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "cream boucle",
        "cocoa wood",
        "soft brass",
        "mint or blush accent"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  },
  {
    id: "forest_terracotta_creative_loft",
    name: "Forest Terracotta Creative Loft",
    catalogDirection: "male",
    palette: ["muted forest green", "terracotta", "warm walnut", "soft beige"],
    materialDirection: "rounded forest trim, terracotta plaster accents, warm walnut details",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "left",
        style: "muted forest arched door with a slim walnut pull"
      },
      primaryWindow: {
        wall: "left",
        style: "terracotta-framed arch with a warm divided-glass pattern"
      },
      floor: {
        material: "warm walnut plank",
        layout: "terracotta_diagonal_plank"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "warm walnut",
        "forest textile",
        "terracotta ceramic",
        "soft beige canvas"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  },
  {
    id: "blush_petal_cottage",
    name: "Blush Petal Cottage",
    catalogDirection: "female",
    palette: ["soft blush", "warm cream", "rosewood", "petal pink"],
    materialDirection: "curved rosewood, premium textile, petal ceramic",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "right",
        style: "soft-blush scalloped door with a petal-ceramic knob"
      },
      primaryWindow: {
        wall: "left",
        style: "oval ribbon-lattice window with a warm cream surround"
      },
      floor: {
        material: "rosewood and cream parquet",
        layout: "parquet_inlay"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "blush boucle",
        "pearl cream lacquer",
        "rosewood",
        "petal pink accent"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  },
  {
    id: "lavender_moon_atelier",
    name: "Lavender Moon Atelier",
    catalogDirection: "female",
    palette: ["powder lavender", "mist blue", "pearl cream", "soft gold"],
    materialDirection: "pearl lacquer, gentle gold trim, misty textile",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "left",
        style: "pearl-cream moon-arch door with a soft-gold handle"
      },
      primaryWindow: {
        wall: "left",
        style: "mist-blue moon-pane window with a slender lavender lattice"
      },
      floor: {
        material: "light maple",
        layout: "mist_blue_herringbone"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "pearl cream lacquer",
        "lavender textile",
        "mist blue glass",
        "soft gold"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  },
  {
    id: "sage_cloud_scandinavian",
    name: "Sage Cloud Scandinavian",
    catalogDirection: "unisex",
    palette: ["soft sage", "cloud white", "pale oak", "warm gray"],
    materialDirection: "pale oak, cloud upholstery, quiet woven texture",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "left",
        style: "cloud-white rounded door with a muted sage inset"
      },
      primaryWindow: {
        wall: "left",
        style: "simple cloud-pane arch with a pale-oak frame"
      },
      floor: {
        material: "whitewashed oak",
        layout: "soft_chevron"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "pale oak",
        "cloud-white upholstery",
        "soft sage textile",
        "warm gray ceramic"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  },
  {
    id: "apricot_sky_social_loft",
    name: "Apricot Sky Social Loft",
    catalogDirection: "unisex",
    palette: ["muted apricot", "dusty blue", "warm sand", "cocoa"],
    materialDirection: "rounded social seating, warm terrazzo, soft canvas",
    architecturalVariation: {
      door: {
        wall: "left",
        hinge: "right",
        style: "dusty-blue social-loft door with a cocoa pull rail"
      },
      primaryWindow: {
        wall: "left",
        style: "apricot-sky split-pane arch with a dusty-blue frame"
      },
      floor: {
        material: "warm sand oak",
        layout: "offset_parquet"
      }
    },
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "warm sand canvas",
        "apricot ceramic",
        "dusty blue textile",
        "cocoa wood"
      ]
    },
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE
  }
]

export const ROOM_V3_OPTIONAL_ROOM_DIRECTIONS: readonly RoomV3OptionalRoomDirectionPlan[] = [
  {
    id: "ink_velvet_night_loft",
    name: "Ink Velvet Night Loft",
    baseCollectionId: "cocoa_navy_modern_studio",
    palette: ["ink navy", "velvet black", "warm ivory", "rose brass", "soft amber"],
    materialDirection: "matte ink walls, cocoa walnut floor, rose-brass trim, restrained amber glow",
    furnitureCompatibility: {
      requiredMaterialFamilies: [
        "warm ivory edge or upholstery",
        "cocoa walnut",
        "rose-brass detail",
        "muted amber accent"
      ]
    },
    furnitureReadabilityRules: [
      "Every dark furniture silhouette needs a warm light edge, light upholstery, or rose-brass detail.",
      "No fully black rug or floor-hugging furniture silhouette.",
      "Keep the avatar and furniture readable at the vertical My Room card scale."
    ],
    requiredVisualLanguage: ROOM_V3_CANONICAL_SHELL_LANGUAGE,
    productionStatus: "direction_only",
    runtimeEligible: false,
    defaultSelection: false
  }
]

// Universal Core is a separate, neutral asset wave. It does not replace the
// themed capsules above: every item must read cleanly in all six Room V3
// shells, including the optional dark-room direction, before it can advance.
export const ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY: RoomV3UniversalFurnitureCompatibilityPlan = {
  compatibleHomeIds: ROOM_V3_HOME_COLLECTIONS.map((home) => home.id),
  compatibleOptionalRoomDirectionIds: ROOM_V3_OPTIONAL_ROOM_DIRECTIONS.map(
    (direction) => direction.id
  ),
  requiredMaterialFamilies: [
    "pale ash or pale oak",
    "cloud-white upholstery or ivory ceramic",
    "soft charcoal detail",
    "restrained soft brass"
  ],
  mobileReadabilityRules: [
    "Use a light primary silhouette with a restrained charcoal outline or inset so the object remains readable in every shell.",
    "Keep accents neutral; do not depend on a room-specific mint, blush, lavender, harbor-blue, sage, or apricot color.",
    "At My Room mobile scale, the primary shape, interaction point, and floor contact must remain legible against both light and dark room directions.",
    "Use the same Blumi painterly material depth and rounded construction as the themed capsules."
  ]
}

export const ROOM_V3_FURNITURE_CATEGORIES: readonly RoomV3FurnitureCategoryPlan[] = [
  floorSeat("dining_chair", "Dining Chair"),
  floorSeat("desk_chair", "Desk Chair"),
  floorSeat("lounge_armchair", "Lounge Armchair"),
  floorSeat("accent_chair", "Accent Chair"),
  floorSeat("loveseat", "Loveseat"),
  floorSeat("long_sofa", "Long Sofa"),
  floorSeat("bench", "Bench"),
  floorSeat("ottoman_pouf", "Ottoman or Pouf"),
  floor("dining_table", "Dining Table"),
  floor("work_desk", "Work Desk"),
  floor("coffee_table", "Coffee Table"),
  floor("side_table", "Side Table"),
  floor("nightstand", "Nightstand"),
  floor("console_table", "Console Table"),
  floorSeat("double_bed", "Double Bed"),
  floor("wardrobe", "Wardrobe"),
  floor("dresser", "Dresser"),
  floor("vanity_table", "Vanity or Compact Grooming Table"),
  floor("bookshelf", "Bookshelf"),
  floor("storage_cabinet", "Storage Cabinet"),
  floor("media_console", "Media Console"),
  floor("open_display_shelf", "Open Display Shelf"),
  floor("room_divider", "Room Divider or Folding Screen"),
  floor("shoe_cabinet", "Shoe Cabinet"),
  floor("rug", "Rug"),
  floor("floor_lamp", "Floor Lamp"),
  surface("table_lamp", "Table Lamp", "tabletop"),
  surface("ceiling_light", "Hanging or Ceiling Light", "ceiling"),
  floor("large_standing_plant", "Large Standing Plant"),
  surface("small_tabletop_plant", "Small Tabletop Plant", "tabletop"),
  surface("wall_mirror", "Mirror", "wall"),
  floor("full_length_mirror", "Full-Length Mirror"),
  surface("wall_artwork", "Wall Artwork", "wall"),
  surface("wall_clock", "Wall Clock", "wall"),
  surface("curtain_set", "Curtain or Window-Dressing Set", "wall"),
  surface("decorative_object_set", "Decorative-Object Set", "tabletop"),
  // A loose cushion set does not have a meaningful rotated silhouette. It
  // remains a floor prop with collision/placement metadata, but should ship
  // as a single verified view rather than pretending a mirrored image is a
  // directional asset.
  floorSingleView("cushion_set", "Cushion Set"),
  surface("books_magazine_stack", "Books or Magazine Stack", "tabletop"),
  surface("ceramic_vase_set", "Ceramic or Vase Set", "tabletop"),
  floor("coat_stand", "Coat Stand"),
  floor("laundry_basket", "Laundry Basket"),
  floor("pet_bed", "Pet Bed"),
  floor("small_speaker", "Small Speaker or Music Unit"),
  surface("tea_coffee_tray", "Tea or Coffee Tray", "tabletop"),
  floor("soft_floor_cushion", "Soft Floor Cushion")
]

export const ROOM_V3_CATALOG_PRODUCTION_COUNTS = getRoomV3CatalogProductionCounts()

export function createRoomV3CatalogManifestPlan(): RoomV3CatalogManifestPlanEntry[] {
  return ROOM_V3_HOME_COLLECTIONS.flatMap((home) =>
    ROOM_V3_FURNITURE_CATEGORIES.flatMap((category) =>
      ROOM_V3_VARIANTS.map((variant) => ({
        id: `room_v3_${home.id}_${category.id}_${variant}`,
        name: `${home.name} ${category.name} ${variant.toUpperCase()}`,
        homeTheme: home.id,
        collectionId: home.id,
        categoryId: category.id,
        variant,
        placementSurface: category.placementSurface,
        interactionType: category.interactionType,
        placementRule: category.placementRule,
        requiresDirectionalAssets: category.requiresDirectionalAssets,
        directions: category.requiresDirectionalAssets
          ? ROOM_V3_DIRECTIONAL_ROTATIONS
          : ROOM_V3_FRONT_ROTATION,
        requiredMaterialFamilies: [...home.furnitureCompatibility.requiredMaterialFamilies],
        thumbnailKey: `room_v3_thumbnail_${home.id}_${category.id}_${variant}`,
        productionStatus: "planned"
      }))
    )
  )
}

export function createRoomV3UniversalCoreManifestPlan(): RoomV3UniversalCoreManifestPlanEntry[] {
  return ROOM_V3_FURNITURE_CATEGORIES.flatMap((category) =>
    ROOM_V3_UNIVERSAL_CORE_VARIANTS.map((variant) => ({
      id: `room_v3_universal_core_${category.id}_${variant}`,
      name: `Universal Core ${category.name} ${variant.toUpperCase()}`,
      collectionId: "universal_core",
      categoryId: category.id,
      variant,
      placementSurface: category.placementSurface,
      interactionType: category.interactionType,
      placementRule: category.placementRule,
      requiresDirectionalAssets: category.requiresDirectionalAssets,
      directions: category.requiresDirectionalAssets
        ? ROOM_V3_DIRECTIONAL_ROTATIONS
        : ROOM_V3_FRONT_ROTATION,
      compatibleHomeIds: [...ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.compatibleHomeIds],
      compatibleOptionalRoomDirectionIds: [
        ...ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.compatibleOptionalRoomDirectionIds
      ],
      requiredMaterialFamilies: [
        ...ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.requiredMaterialFamilies
      ],
      thumbnailKey: `room_v3_thumbnail_universal_core_${category.id}_${variant}`,
      productionStatus: "planned"
    }))
  )
}

function getRoomV3CatalogProductionCounts(): {
  roomShells: number
  logicalFurnitureProducts: number
  directionalFurnitureRenders: number
  singleViewFurnitureRenders: number
  interactionReadySeatingProducts: number
  metadataEntries: number
  catalogThumbnails: number
  minimumQaSheets: number
} {
  const manifest = createRoomV3CatalogManifestPlan()
  const directionalProducts = manifest.filter((entry) => entry.requiresDirectionalAssets)
  const seatingProducts = manifest.filter((entry) => entry.interactionType === "seat")
  const roomQaSheets = ROOM_V3_HOME_COLLECTIONS.length * 10

  return {
    roomShells: ROOM_V3_HOME_COLLECTIONS.length,
    logicalFurnitureProducts: manifest.length,
    directionalFurnitureRenders:
      directionalProducts.length * ROOM_V3_DIRECTIONAL_ROTATIONS.length,
    singleViewFurnitureRenders: manifest.length - directionalProducts.length,
    interactionReadySeatingProducts: seatingProducts.length,
    metadataEntries: ROOM_V3_HOME_COLLECTIONS.length + manifest.length,
    catalogThumbnails: manifest.length,
    minimumQaSheets: 1 + roomQaSheets + manifest.length
  }
}

function floor(id: string, name: string): RoomV3FurnitureCategoryPlan {
  return {
    id,
    name,
    placementSurface: "floor",
    requiresDirectionalAssets: true,
    interactionType: "decor",
    placementRule: "free_floor"
  }
}

function floorSeat(id: string, name: string): RoomV3FurnitureCategoryPlan {
  return {
    id,
    name,
    placementSurface: "floor",
    requiresDirectionalAssets: true,
    interactionType: "seat",
    placementRule: "free_floor"
  }
}

function floorSingleView(id: string, name: string): RoomV3FurnitureCategoryPlan {
  return {
    id,
    name,
    placementSurface: "floor",
    requiresDirectionalAssets: false,
    interactionType: "decor",
    placementRule: "free_floor"
  }
}

function surface(
  id: string,
  name: string,
  placementSurface: Exclude<RoomPlacementSurface, "floor">
): RoomV3FurnitureCategoryPlan {
  return {
    id,
    name,
    placementSurface,
    requiresDirectionalAssets: false,
    interactionType: "decor",
    placementRule: placementSurface === "wall"
      ? "wall_region"
      : placementSurface === "ceiling"
        ? "ceiling_region"
        : "tabletop_support"
  }
}
