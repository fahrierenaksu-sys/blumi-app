export type RoomV3CatalogDirection = "male" | "female" | "unisex"

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
