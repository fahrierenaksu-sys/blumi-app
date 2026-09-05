import {
  ROOM_V3_HOME_COLLECTIONS,
  ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY,
  type RoomV3HomeCollectionPlan
} from "./roomV3ProductionPlan"
import type { RoomFurnitureRotation, RoomPlacementSurface } from "./roomV2.types"

const REQUIRED_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

const MAX_FLOOR_CONTACT_DRIFT_PX = 2

export type RoomV3FurniturePilotCandidateId =
  | "cocoa_dining_chair_a"
  | "cocoa_dining_chair_b"
  | "cocoa_dining_chair_d"
  | "cocoa_lounge_armchair_a"
  | "cocoa_lounge_armchair_b"
  | "universal_cloud_loveseat_a"
  | "universal_petal_side_table_a"
  | "universal_orbit_floor_lamp_a"
  | "universal_tidy_work_desk_a"
  | "universal_arc_coffee_table_b"
  | "universal_cloud_accent_chair_b"
  | "universal_round_dining_table_a"
  | "universal_soft_media_console_b"
  | "universal_open_bookshelf_a"
  | "universal_dining_chair_a"
  | "universal_desk_chair_a"
  | "universal_bench_a"
  | "universal_soft_floor_cushion_a"
  | "universal_pet_bed_a"
  | "universal_nightstand_a"
  | "universal_laundry_basket_a"
  | "universal_cushion_set_a"
  | "universal_vanity_table_a"
  | "universal_shoe_cabinet_a"
  | "universal_long_sofa_a"
  | "universal_lounge_armchair_a"
  | "universal_cloud_bed_b"
  | "universal_rounded_wardrobe_a"
  | "universal_soft_media_console_a"
  | "universal_soft_coat_stand_a"
  | "universal_soft_pouf_b"
  | "universal_arch_wall_mirror_a"
  | "universal_storage_cabinet_a"
  | "universal_dresser_a"
  | "universal_console_table_a"
  | "universal_large_standing_plant_a"
  | "universal_wall_artwork_a"
  | "universal_ceiling_light_a"
  | "universal_curtain_set_a"
  | "universal_decorative_object_set_a"
  | "universal_table_lamp_a"
  | "universal_wall_clock_a"
  | "universal_small_tabletop_plant_a"
  | "universal_ceramic_vase_set_a"
  | "universal_books_magazine_stack_a"
  | "universal_tea_coffee_tray_a"
  | "universal_small_speaker_a"
  | "universal_rug_a"
  | "universal_full_length_mirror_a"
  | "universal_open_display_shelf_a"
  | "universal_room_divider_a"

export interface RoomV3FurnitureTechnicalEvidence {
  alphaAuditId: string
  hasCleanAlpha: boolean
  hasNoHalo: boolean
  hasTransparentCorners: boolean
  hasNoBakedBackground: boolean
  hasTightBounds: boolean
  hasSharedFloorContact: boolean
}

export interface RoomV3FurnitureArtEvidence {
  visualReviewId: string
  matchesBlumiPainterlyStyle: boolean
  hasStrongMobileSilhouette: boolean
  directionsAreGenuine: boolean
  visibleMaterialFamilies: readonly string[]
}

export interface RoomV3FurnitureRuntimeEvidence {
  scaleSceneEvidenceId: string
  depthLaneEvidenceId: string
  collisionEvidenceId: string
  seatingEvidenceId?: string
  simulatorEvidenceId: string
  independentReviewId: string
}

export interface RoomV3FurnitureArtifactBaseline {
  sha256: string
  width: number
  height: number
  alphaBounds: {
    minX: number
    minY: number
    maxXInclusive: number
    maxYInclusive: number
  }
  transparentPixelCount: number
  partialAlphaPixelCount: number
}

export interface RoomV3FurniturePilotCandidate {
  id: RoomV3FurniturePilotCandidateId
  homeTheme: RoomV3HomeCollectionPlan["id"] | "universal_core"
  categoryLabel: string
  isSeatable: boolean
  requiresDirectionalAssets?: boolean
  placementSurface?: RoomPlacementSurface
  assetPathsByRotation: Partial<Record<RoomFurnitureRotation, string>>
  artifactBaselinesByRotation?: Partial<
    Record<RoomFurnitureRotation, RoomV3FurnitureArtifactBaseline>
  >
  technicalEvidence?: RoomV3FurnitureTechnicalEvidence
  artEvidence?: RoomV3FurnitureArtEvidence
  runtimeEvidence?: RoomV3FurnitureRuntimeEvidence
}

export type RoomV3FurnitureCandidateIssueId =
  | "unknown_home_theme"
  | "missing_directional_asset"
  | "reused_directional_asset"
  | "missing_verified_asset_hashes"
  | "inconsistent_floor_contact_line"
  | "missing_alpha_or_grounding_review"
  | "style_review_not_approved"
  | "missing_mobile_readability_review"
  | "directional_art_not_verified"
  | "collection_material_mismatch"
  | "missing_runtime_scale_evidence"
  | "missing_depth_lane_evidence"
  | "missing_collision_evidence"
  | "missing_seating_evidence"
  | "missing_simulator_evidence"
  | "missing_independent_review"
  | "artifact_verifier_required"

export interface RoomV3FurnitureCandidateValidation {
  // This only means that a producer submitted every declaration. It is not a
  // trust or QA verdict; asset bytes and evidence still need separate reading.
  hasCompleteDeclaredEvidence: boolean
  isReadyForRuntime: false
  issueIds: RoomV3FurnitureCandidateIssueId[]
}

// These files are intentionally recorded only as candidate pilots. They are
// not linked from the user-visible catalog, and their pending evidence keeps
// both products fail-closed until a real renderer/Simulator review exists.
export const ROOM_V3_FURNITURE_PILOT_CANDIDATES: readonly RoomV3FurniturePilotCandidate[] = [
  {
    id: "cocoa_dining_chair_a",
    homeTheme: "cocoa_navy_modern_studio",
    categoryLabel: "Dining chair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/cocoa_dining_chair_a/cocoa_dining_chair_a_front.png",
      back: "assets/runtime/candidates/cocoa_dining_chair_a/cocoa_dining_chair_a_back.png",
      left: "assets/runtime/candidates/cocoa_dining_chair_a/cocoa_dining_chair_a_left.png",
      right: "assets/runtime/candidates/cocoa_dining_chair_a/cocoa_dining_chair_a_right.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "ae89af042a356cf57d1e3bfbfa7e81156d67a3f0ca2eee4d374fe4f1748bdd8a",
        width: 850,
        height: 1040,
        alphaBounds: { minX: 87, minY: 130, maxXInclusive: 762, maxYInclusive: 999 },
        transparentPixelCount: 553696,
        partialAlphaPixelCount: 5240
      },
      back: {
        sha256: "7b78dda9fdab83aaea44c386d5657ae81f9e4d1501dad69d7df665ddeebbcecc",
        width: 850,
        height: 1040,
        alphaBounds: { minX: 67, minY: 125, maxXInclusive: 781, maxYInclusive: 999 },
        transparentPixelCount: 525780,
        partialAlphaPixelCount: 5268
      },
      left: {
        sha256: "08b4bb90611326fe674a6edda4a63ac71ce53f1ecf48f830e40aa841fe42a667",
        width: 850,
        height: 1040,
        alphaBounds: { minX: 108, minY: 103, maxXInclusive: 741, maxYInclusive: 999 },
        transparentPixelCount: 674832,
        partialAlphaPixelCount: 3824
      },
      right: {
        sha256: "86851196d9af62bbdd90c52b680049b02faeb7721da27dc59b7c96ec88308ab6",
        width: 850,
        height: 1040,
        alphaBounds: { minX: 78, minY: 61, maxXInclusive: 771, maxYInclusive: 999 },
        transparentPixelCount: 653859,
        partialAlphaPixelCount: 4062
      }
    },
    artEvidence: {
      visualReviewId: "candidate-review-cocoa-dining-chair-a",
      matchesBlumiPainterlyStyle: false,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: ["cocoa wood", "cream boucle", "soft brass"]
    }
  },
  {
    id: "cocoa_dining_chair_b",
    homeTheme: "cocoa_navy_modern_studio",
    categoryLabel: "Dining chair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/cocoa_dining_chair_b/cocoa_dining_chair_b_front_pilot_v2.png",
      back: "assets/runtime/candidates/cocoa_dining_chair_b/cocoa_dining_chair_b_back_pilot_v2.png",
      left: "assets/runtime/candidates/cocoa_dining_chair_b/cocoa_dining_chair_b_left_pilot_v2.png",
      right: "assets/runtime/candidates/cocoa_dining_chair_b/cocoa_dining_chair_b_right_pilot_v2.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "3b27431c42e5cfe47a749c301923658bf889c6f0013e8660be83e814113010f8",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 302, minY: 115, maxXInclusive: 949, maxYInclusive: 1130 },
        transparentPixelCount: 1153191,
        partialAlphaPixelCount: 4043
      },
      back: {
        sha256: "b01b4b64eb217c1524d85e10b170a95f5a2801f0add5297d63fa6e1885b73d85",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 295, minY: 107, maxXInclusive: 953, maxYInclusive: 1138 },
        transparentPixelCount: 1146339,
        partialAlphaPixelCount: 4394
      },
      left: {
        sha256: "e52d651190bca8f4fc1d49c7dd495bd940ed0a6d884f50a04aa470cf38930ce6",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 319, minY: 112, maxXInclusive: 944, maxYInclusive: 1133 },
        transparentPixelCount: 1385632,
        partialAlphaPixelCount: 3100
      },
      right: {
        sha256: "217407a5571777ec1b9b48d942cc04e882a2d791dbed0e435d878b3f788e79c6",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 310, minY: 112, maxXInclusive: 918, maxYInclusive: 1133 },
        transparentPixelCount: 1390736,
        partialAlphaPixelCount: 2906
      }
    },
    artEvidence: {
      visualReviewId: "candidate-review-cocoa-dining-chair-b-fail",
      matchesBlumiPainterlyStyle: false,
      hasStrongMobileSilhouette: false,
      directionsAreGenuine: true,
      visibleMaterialFamilies: ["cocoa wood", "cream boucle", "soft brass"]
    }
  },
  {
    id: "cocoa_dining_chair_d",
    homeTheme: "cocoa_navy_modern_studio",
    categoryLabel: "Dining chair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/cocoa_dining_chair_d/cocoa_dining_chair_d_front_pilot_v1.png",
      back: "assets/runtime/candidates/cocoa_dining_chair_d/cocoa_dining_chair_d_back_pilot_v1.png",
      left: "assets/runtime/candidates/cocoa_dining_chair_d/cocoa_dining_chair_d_left_pilot_v1.png",
      right: "assets/runtime/candidates/cocoa_dining_chair_d/cocoa_dining_chair_d_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "3a1b9bcb1e7b3e2c5e8a0a642094cefb95d6d6cd4d7a14b699f4bac545fa920d",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 273, minY: 161, maxXInclusive: 997, maxYInclusive: 1110 },
        transparentPixelCount: 1117103,
        partialAlphaPixelCount: 4728
      },
      back: {
        sha256: "24e011a598f22edc77f03b062b6dff9f5156e2a99420e080d1022e4eb73c73fb",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 266, minY: 232, maxXInclusive: 984, maxYInclusive: 1110 },
        transparentPixelCount: 1194096,
        partialAlphaPixelCount: 1975
      },
      left: {
        sha256: "331861e4e64f44de1a3f8b78a37d6869343517da4df7606bce602f154e824ae3",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 299, minY: 214, maxXInclusive: 966, maxYInclusive: 1110 },
        transparentPixelCount: 1307219,
        partialAlphaPixelCount: 2345
      },
      right: {
        sha256: "58a45eee51044360ad3ffc1daf6bbc14bd710906d7ad7db408f8b5fede6a4ddd",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 278, minY: 161, maxXInclusive: 943, maxYInclusive: 1110 },
        transparentPixelCount: 1255740,
        partialAlphaPixelCount: 2211
      }
    },
    technicalEvidence: {
      alphaAuditId: "cocoa-dining-chair-d-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "cocoa-dining-chair-d-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "cocoa wood",
        "cream boucle",
        "soft brass",
        "mint or blush accent"
      ]
    }
  },
  {
    id: "cocoa_lounge_armchair_b",
    homeTheme: "cocoa_navy_modern_studio",
    categoryLabel: "Lounge armchair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/cocoa_lounge_armchair_b/cocoa_lounge_armchair_b_front_pilot_v1.png",
      back: "assets/runtime/candidates/cocoa_lounge_armchair_b/cocoa_lounge_armchair_b_back_pilot_v1.png",
      left: "assets/runtime/candidates/cocoa_lounge_armchair_b/cocoa_lounge_armchair_b_left_pilot_v1.png",
      right: "assets/runtime/candidates/cocoa_lounge_armchair_b/cocoa_lounge_armchair_b_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "1f1713a9f11a4508c7d8044981857f37366945f7deb9b258d9d85d70e295179f",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 182, minY: 260, maxXInclusive: 1104, maxYInclusive: 1110 },
        transparentPixelCount: 982144,
        partialAlphaPixelCount: 2167
      },
      back: {
        sha256: "5fc1be2a0fcdc331c6789cb4e2d888112dcfab3249dfeb04d299e5f634dfa9be",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 174, minY: 308, maxXInclusive: 1121, maxYInclusive: 1110 },
        transparentPixelCount: 1042537,
        partialAlphaPixelCount: 2481
      },
      left: {
        sha256: "b064540e8101724e6d3d1937ebfe277d898c79d302bd6183035898fc2f56f94e",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 199, minY: 247, maxXInclusive: 1057, maxYInclusive: 1110 },
        transparentPixelCount: 1082156,
        partialAlphaPixelCount: 6969
      },
      right: {
        sha256: "74e1535bcf080f80132bb136f699013cce5245d4626bbf7129db035b1fdf7b75",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 242, minY: 250, maxXInclusive: 1002, maxYInclusive: 1110 },
        transparentPixelCount: 1165299,
        partialAlphaPixelCount: 3410
      }
    },
    technicalEvidence: {
      alphaAuditId: "cocoa-lounge-armchair-b-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "cocoa-lounge-armchair-b-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "cocoa wood",
        "cream boucle",
        "soft brass",
        "mint or blush accent"
      ]
    }
  },
  {
    id: "universal_petal_side_table_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal side table",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "f8516d4b72c3b206563524f3782b1cf914cf91bf23bfab14fc380456a7b8e3cb",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 136, minY: 212, maxXInclusive: 1109, maxYInclusive: 1110 },
        transparentPixelCount: 852147,
        partialAlphaPixelCount: 1921
      },
      back: {
        sha256: "a3ef8f6ec37aacf151026ba54c6cd1335c76cd03d8b0abe003a87ce26a425734",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 188, minY: 268, maxXInclusive: 1057, maxYInclusive: 1110 },
        transparentPixelCount: 970384,
        partialAlphaPixelCount: 1435
      },
      left: {
        sha256: "f56aa8f3bd81411021b278d30c24a92fa234b4a520a59dfe85d17cb84f7495a8",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 234, minY: 193, maxXInclusive: 1014, maxYInclusive: 1110 },
        transparentPixelCount: 1000485,
        partialAlphaPixelCount: 1668
      },
      right: {
        sha256: "fd5bbf7c9d06937fb16341f71fd2916c918238d91ce16764d73bdfe8142ecd87",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 202, minY: 187, maxXInclusive: 1055, maxYInclusive: 1110 },
        transparentPixelCount: 958979,
        partialAlphaPixelCount: 1499
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-petal-side-table-a-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-petal-side-table-a-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_cloud_loveseat_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal loveseat",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "e086060d23fe2941607cae0025bfcb54d283c2fc887b32f45adad264c26f1071",
        width: 1334,
        height: 1179,
        alphaBounds: { minX: 70, minY: 149, maxXInclusive: 1288, maxYInclusive: 1110 },
        transparentPixelCount: 760568,
        partialAlphaPixelCount: 3085
      },
      back: {
        sha256: "87029f4a4bae685e8e4c1b82c19f5ea767038af9d9f04e001f81cf5f796ac00e",
        width: 1333,
        height: 1180,
        alphaBounds: { minX: 102, minY: 262, maxXInclusive: 1234, maxYInclusive: 1110 },
        transparentPixelCount: 961401,
        partialAlphaPixelCount: 2660
      },
      left: {
        sha256: "9fe5dd520bf70a4fa59316ed2397580b6afd40706c77e6326ccdaf26eac12146",
        width: 1333,
        height: 1180,
        alphaBounds: { minX: 109, minY: 153, maxXInclusive: 1225, maxYInclusive: 1110 },
        transparentPixelCount: 891744,
        partialAlphaPixelCount: 2513
      },
      right: {
        sha256: "1ab8a9ac0f548a6b341a52ba19c9afd38da307886945b453a3c98c5355fd7fb0",
        width: 1333,
        height: 1180,
        alphaBounds: { minX: 173, minY: 134, maxXInclusive: 1202, maxYInclusive: 1110 },
        transparentPixelCount: 943743,
        partialAlphaPixelCount: 2102
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-cloud-loveseat-a-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-cloud-loveseat-a-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_orbit_floor_lamp_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal floor lamp",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "5e066c1ceba5fd7f234b50ec69dce87485139275add86c58be2d6b71afc77d36",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 439, minY: 95, maxXInclusive: 822, maxYInclusive: 1110 },
        transparentPixelCount: 1400808,
        partialAlphaPixelCount: 16988
      },
      back: {
        sha256: "660b09980df8815159a72d4bbc64853cff3daf5111408fa0f8aa71c4409a7f08",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 433, minY: 99, maxXInclusive: 814, maxYInclusive: 1110 },
        transparentPixelCount: 1408509,
        partialAlphaPixelCount: 16463
      },
      left: {
        sha256: "89c9a66a69ae35a19fc142aa0ac82e4410e165d6c2558ec30f9a9e68f3b7b9bd",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 420, minY: 95, maxXInclusive: 829, maxYInclusive: 1110 },
        transparentPixelCount: 1407891,
        partialAlphaPixelCount: 18844
      },
      right: {
        sha256: "1272c5f368eaf3e9016b307e230a639fddb697856f66c01fb4d70bfed2ca553d",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 418, minY: 96, maxXInclusive: 856, maxYInclusive: 1110 },
        transparentPixelCount: 1406500,
        partialAlphaPixelCount: 19001
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-orbit-floor-lamp-a-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-orbit-floor-lamp-a-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_tidy_work_desk_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal work desk",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "a4924e5db9d6e8de4e23a1af5947849bdc71a05d3606c1c3e6388dcb25094878",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 102, minY: 310, maxXInclusive: 1151, maxYInclusive: 1110 },
        transparentPixelCount: 1111107,
        partialAlphaPixelCount: 15865
      },
      back: {
        sha256: "6dfe54b48df933794c1e463298e9d5c6e684812a45a0783cb4b17009716ac100",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 102, minY: 347, maxXInclusive: 1151, maxYInclusive: 1110 },
        transparentPixelCount: 1196678,
        partialAlphaPixelCount: 21654
      },
      left: {
        sha256: "d216cfcbe96d35f7b8dd4913ff7b821caa1023e432a351b4aa9468d20bcc0b9b",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 353, minY: 261, maxXInclusive: 900, maxYInclusive: 1110 },
        transparentPixelCount: 1318541,
        partialAlphaPixelCount: 12016
      },
      right: {
        sha256: "6429072a459581b1205492293a45cdae5313d1c7ea45b3231725b18d5fb75144",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 299, minY: 261, maxXInclusive: 954, maxYInclusive: 1110 },
        transparentPixelCount: 1214643,
        partialAlphaPixelCount: 14089
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-tidy-work-desk-a-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-tidy-work-desk-a-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_arc_coffee_table_b",
    homeTheme: "universal_core",
    categoryLabel: "Universal coffee table",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "4479b7a7a7c62c1ca2240dcd9b7c2eb297640f25df37f64067a9a9273513b6f4",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 122, minY: 654, maxXInclusive: 1131, maxYInclusive: 1110 },
        transparentPixelCount: 1194384,
        partialAlphaPixelCount: 9618
      },
      back: {
        sha256: "b232f08abb380e5c24e83f78e0ac5d9f3cb4dd81ca97f7637e9c090e751db3fa",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 49, minY: 600, maxXInclusive: 1202, maxYInclusive: 1110 },
        transparentPixelCount: 1154901,
        partialAlphaPixelCount: 2515
      },
      left: {
        sha256: "1a0c5e4f2a8c5e277bd43c9067e8012298595bcc021c4db0623ec767dca914e9",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 114, minY: 469, maxXInclusive: 1161, maxYInclusive: 1110 },
        transparentPixelCount: 1131114,
        partialAlphaPixelCount: 10073
      },
      right: {
        sha256: "6514e8cd6a716fe666683906b542a53b9821371bace6db32a39193c92428da60",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 152, minY: 559, maxXInclusive: 1103, maxYInclusive: 1110 },
        transparentPixelCount: 1207342,
        partialAlphaPixelCount: 9134
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-arc-coffee-table-b-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-arc-coffee-table-b-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_cloud_accent_chair_b",
    homeTheme: "universal_core",
    categoryLabel: "Universal accent chair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "77858d5e0cdeefb679aff8715ed6f8d0d92e6f9903e4f9346f313948b775747b",
        width: 1199,
        height: 1312,
        alphaBounds: { minX: 169, minY: 89, maxXInclusive: 1029, maxYInclusive: 1110 },
        transparentPixelCount: 923012,
        partialAlphaPixelCount: 2760
      },
      back: {
        sha256: "0ed3e6e81b10c381318cdcc71786bcb82b7732a298bafaf27fdbd3c783f94ac1",
        width: 1197,
        height: 1315,
        alphaBounds: { minX: 225, minY: 86, maxXInclusive: 970, maxYInclusive: 1110 },
        transparentPixelCount: 1021781,
        partialAlphaPixelCount: 2611
      },
      left: {
        sha256: "263a84cbb8d10dbfbe34e3b72efc6beec1bb2c810e266ef21df01d5746e2d6c1",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 175, minY: 112, maxXInclusive: 1093, maxYInclusive: 1110 },
        transparentPixelCount: 971787,
        partialAlphaPixelCount: 2297
      },
      right: {
        sha256: "e1319d359b4789a8d5c0b93e956e3a0aab367827be63b26eeebff89cd3e0fd65",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 175, minY: 68, maxXInclusive: 1091, maxYInclusive: 1110 },
        transparentPixelCount: 934146,
        partialAlphaPixelCount: 2909
      }
    },
    technicalEvidence: {
      alphaAuditId: "universal-cloud-accent-chair-b-alpha-grounding-qa-v1",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "universal-cloud-accent-chair-b-independent-visual-review-v1",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    }
  },
  {
    id: "universal_round_dining_table_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal dining table",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: { sha256: "17432f496f263a2044e47f103b6b67e5701fb679b9a932ef06ea7d61ff954b16", width: 1254, height: 1254, alphaBounds: { minX: 81, minY: 196, maxXInclusive: 1172, maxYInclusive: 1110 }, transparentPixelCount: 1020602, partialAlphaPixelCount: 2687 },
      back: { sha256: "9fdd20d4ac65de21898413e3be68bdc8edbec66c843637b8e908f09268954773", width: 1254, height: 1254, alphaBounds: { minX: 110, minY: 99, maxXInclusive: 1147, maxYInclusive: 1110 }, transparentPixelCount: 976925, partialAlphaPixelCount: 2573 },
      left: { sha256: "9497e2841f381f56587909bfca894c58f92d111d24807bc60d2674977b3d392a", width: 1254, height: 1254, alphaBounds: { minX: 78, minY: 233, maxXInclusive: 1163, maxYInclusive: 1110 }, transparentPixelCount: 1080977, partialAlphaPixelCount: 2960 },
      right: { sha256: "11db173d384d9daed3a6a615282ae43e3a2d27212558e2857bdcada3d867e38e", width: 1254, height: 1254, alphaBounds: { minX: 125, minY: 290, maxXInclusive: 1129, maxYInclusive: 1110 }, transparentPixelCount: 1127727, partialAlphaPixelCount: 3259 }
    },
    technicalEvidence: universalTechnicalEvidence("universal-round-dining-table-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-round-dining-table-a-independent-visual-review-v1")
  },
  {
    id: "universal_soft_media_console_b",
    homeTheme: "universal_core",
    categoryLabel: "Universal media console",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: { sha256: "e93d6af6b293c72f38ce2978f1d0f627acec725c5550d55810583dbf7e0ad622", width: 1254, height: 1254, alphaBounds: { minX: 67, minY: 754, maxXInclusive: 1186, maxYInclusive: 1110 }, transparentPixelCount: 1218363, partialAlphaPixelCount: 6115 },
      back: { sha256: "07e9d9e682925931f1d2c4c7a46571271991fc6305831f87ec5460b9ec7bbc50", width: 1254, height: 1254, alphaBounds: { minX: 67, minY: 756, maxXInclusive: 1186, maxYInclusive: 1110 }, transparentPixelCount: 1222179, partialAlphaPixelCount: 5069 },
      left: { sha256: "7979354c0a456b4c1175290bf31f85ddf7b96e0ef5d6f9f60d6593875cc1b01b", width: 1254, height: 1254, alphaBounds: { minX: 67, minY: 602, maxXInclusive: 1186, maxYInclusive: 1110 }, transparentPixelCount: 1183746, partialAlphaPixelCount: 3918 },
      right: { sha256: "e0fffda5e055b3f5dab7f8f5389f4b10769c6a4cfef7355d6c4858e8ebfcb412", width: 1254, height: 1254, alphaBounds: { minX: 67, minY: 599, maxXInclusive: 1186, maxYInclusive: 1110 }, transparentPixelCount: 1179386, partialAlphaPixelCount: 3583 }
    },
    technicalEvidence: universalTechnicalEvidence("universal-soft-media-console-b-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-soft-media-console-b-independent-visual-review-v1")
  },
  {
    id: "universal_open_bookshelf_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal open bookshelf",
    isSeatable: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_front_pilot_v1.png",
      back: "assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_back_pilot_v1.png",
      left: "assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_left_pilot_v1.png",
      right: "assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_right_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: { sha256: "9fc41a21b0bf0a85691597e34eaaa8510be6c6caca3c2f554165deaedbf6914b", width: 1254, height: 1254, alphaBounds: { minX: 377, minY: 161, maxXInclusive: 877, maxYInclusive: 1110 }, transparentPixelCount: 1127619, partialAlphaPixelCount: 7759 },
      back: { sha256: "27e5959df8346b6947ffa77bda2a7be7f7abda5fcf977b7dcc8c71320f9478a1", width: 1254, height: 1254, alphaBounds: { minX: 415, minY: 161, maxXInclusive: 839, maxYInclusive: 1110 }, transparentPixelCount: 1186659, partialAlphaPixelCount: 8743 },
      left: { sha256: "821292c4e6495f0cafbf208f18ba303f3f110f55f2d9b30284602bba515a2df5", width: 1254, height: 1254, alphaBounds: { minX: 390, minY: 161, maxXInclusive: 863, maxYInclusive: 1110 }, transparentPixelCount: 1168316, partialAlphaPixelCount: 9453 },
      right: { sha256: "edcc083f3b0b0b7c073ef39fb8ff9b10ec70af7b5a91f3ef55d12531eca47fe2", width: 1254, height: 1254, alphaBounds: { minX: 443, minY: 161, maxXInclusive: 811, maxYInclusive: 1110 }, transparentPixelCount: 1255951, partialAlphaPixelCount: 7945 }
    },
    technicalEvidence: universalTechnicalEvidence("universal-open-bookshelf-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-open-bookshelf-a-independent-visual-review-v1")
  },
  {
    id: "universal_table_lamp_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal table lamp",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_table_lamp_a/universal_table_lamp_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "aa0ac70aca5b4e6cfb100b374b4cd616160057f3088b2c3931c69bd703e3ee06",
        width: 1024,
        height: 1536,
        alphaBounds: { minX: 104, minY: 150, maxXInclusive: 895, maxYInclusive: 1367 },
        transparentPixelCount: 905023,
        partialAlphaPixelCount: 4143
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-table-lamp-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-table-lamp-a-independent-visual-review-v1")
  },
  {
    id: "universal_wall_clock_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal wall clock",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_wall_clock_a/universal_wall_clock_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "1bac531cc3e9e2ab348e4bbf4ceee522cd304e2625d0f1cebce155e60261e470",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 131, minY: 97, maxXInclusive: 1124, maxYInclusive: 1129 },
        transparentPixelCount: 766568,
        partialAlphaPixelCount: 3545
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-wall-clock-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-wall-clock-a-independent-visual-review-v1")
  },
  {
    id: "universal_small_tabletop_plant_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal small tabletop plant",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_small_tabletop_plant_a/universal_small_tabletop_plant_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "02f143501c0983969ade5860cdd6ce6c0918412535892fc39bea411f6e8df435",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 306, minY: 226, maxXInclusive: 944, maxYInclusive: 1065 },
        transparentPixelCount: 1150493,
        partialAlphaPixelCount: 66257
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-small-tabletop-plant-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-small-tabletop-plant-a-independent-visual-review-v1")
  },
  {
    id: "universal_ceramic_vase_set_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal ceramic vase set",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_ceramic_vase_set_a/universal_ceramic_vase_set_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "9f17a18928bd0e246cd89bdea20ec0f3c282f73ddf7d31a2ded198ffae1db2a6",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 190, minY: 150, maxXInclusive: 1006, maxYInclusive: 1093 },
        transparentPixelCount: 1141022,
        partialAlphaPixelCount: 7313
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-ceramic-vase-set-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-ceramic-vase-set-a-independent-visual-review-v1")
  },
  {
    id: "universal_books_magazine_stack_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal books and magazine stack",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_books_magazine_stack_a/universal_books_magazine_stack_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "d7a990e8b2a38453c98ee172127e82edd4a4523779d6ff9c0d07cba400641ab6",
        width: 1254,
        height: 1254,
        alphaBounds: { minX: 141, minY: 260, maxXInclusive: 1125, maxYInclusive: 1027 },
        transparentPixelCount: 1021190,
        partialAlphaPixelCount: 3733
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-books-magazine-stack-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-books-magazine-stack-a-independent-visual-review-v1")
  },
  {
    id: "universal_tea_coffee_tray_a",
    homeTheme: "universal_core",
    categoryLabel: "Universal tea and coffee tray",
    isSeatable: false,
    requiresDirectionalAssets: false,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/universal_tea_coffee_tray_a/universal_tea_coffee_tray_a_front_pilot_v1.png"
    },
    artifactBaselinesByRotation: {
      front: {
        sha256: "69cc8151a36e99b861af2eab2f43af46e559cdaf9fcf3df4a3ef6fff8910bc6f",
        width: 1536,
        height: 1024,
        alphaBounds: { minX: 211, minY: 149, maxXInclusive: 1321, maxYInclusive: 856 },
        transparentPixelCount: 1023522,
        partialAlphaPixelCount: 3185
      }
    },
    technicalEvidence: universalTechnicalEvidence("universal-tea-coffee-tray-a-alpha-grounding-qa-v1"),
    artEvidence: universalArtEvidence("universal-tea-coffee-tray-a-independent-visual-review-v1")
  },
  createUniversalDirectionalCandidate({
    id: "universal_dining_chair_a",
    categoryLabel: "Universal dining chair",
    isSeatable: true,
    artifactBaselinesByRotation: {
      front: { sha256: "a4bcb06019836c736828b732d30ad255fb4eda2910da2efa7ffd48dc85e8424f", width: 1254, height: 1254, alphaBounds: { minX: 246, minY: 66, maxXInclusive: 1000, maxYInclusive: 1186 }, transparentPixelCount: 1046747, partialAlphaPixelCount: 6401 },
      back: { sha256: "07d96670cfb0796b80f1b2a43219434c1cbf89f06e1f719ec4df82034e392e3b", width: 1254, height: 1254, alphaBounds: { minX: 256, minY: 67, maxXInclusive: 992, maxYInclusive: 1184 }, transparentPixelCount: 1055569, partialAlphaPixelCount: 6397 },
      left: { sha256: "cd493e551fe5364c538c1db5010d19d4f8d35d80508e529d3b6e2f72dd95646b", width: 1254, height: 1254, alphaBounds: { minX: 265, minY: 85, maxXInclusive: 985, maxYInclusive: 1137 }, transparentPixelCount: 1301640, partialAlphaPixelCount: 4921 },
      right: { sha256: "91c4a56104ff23f896c753f48f105751dcee380383771c5595448a27495c9510", width: 1254, height: 1254, alphaBounds: { minX: 257, minY: 77, maxXInclusive: 988, maxYInclusive: 1154 }, transparentPixelCount: 1292887, partialAlphaPixelCount: 4941 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_desk_chair_a",
    categoryLabel: "Universal desk chair",
    isSeatable: true,
    artifactBaselinesByRotation: {
      front: { sha256: "fa3500bacfc580b0b129ffe4086165b8fae977fa7a3624bc68073dd070a02fa5", width: 1254, height: 1254, alphaBounds: { minX: 276, minY: 106, maxXInclusive: 977, maxYInclusive: 1146 }, transparentPixelCount: 1109706, partialAlphaPixelCount: 5783 },
      back: { sha256: "8a1d49a220fe48a10f3f78e4b5ba2900290733ad32405d87bfb580f6a1f75e4f", width: 1254, height: 1254, alphaBounds: { minX: 286, minY: 104, maxXInclusive: 969, maxYInclusive: 1147 }, transparentPixelCount: 1126367, partialAlphaPixelCount: 5733 },
      left: { sha256: "076b565b29c7eda652cb3f0f506c7a6212507d3541fcbcbd55cbff662f87ab96", width: 1254, height: 1254, alphaBounds: { minX: 319, minY: 88, maxXInclusive: 956, maxYInclusive: 1138 }, transparentPixelCount: 1321446, partialAlphaPixelCount: 4453 },
      right: { sha256: "366fe9785cdfedf68d7d7ae67bba30901fc6ca9f1935ff5cc69e2e86e6c2c5e2", width: 1254, height: 1254, alphaBounds: { minX: 294, minY: 121, maxXInclusive: 937, maxYInclusive: 1114 }, transparentPixelCount: 1336016, partialAlphaPixelCount: 4551 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_bench_a",
    categoryLabel: "Universal soft bench",
    isSeatable: true,
    artifactBaselinesByRotation: {
      front: { sha256: "817065e4380298279a0a22f427c56241ac1ae8ad9a51f22ee6eca5861b2dfc9b", width: 1254, height: 1254, alphaBounds: { minX: 98, minY: 416, maxXInclusive: 1155, maxYInclusive: 836 }, transparentPixelCount: 1187462, partialAlphaPixelCount: 3480 },
      back: { sha256: "f489999b3a1f0a65df82825dcffd416fc11d566a89c344088f033e70c6fcc091", width: 1254, height: 1254, alphaBounds: { minX: 100, minY: 417, maxXInclusive: 1153, maxYInclusive: 863 }, transparentPixelCount: 1162970, partialAlphaPixelCount: 3472 },
      left: { sha256: "4d69f45facbf8ece7a88c23e2ceaa2f8dd6c2c8d0c6b7069b4043714cca4aabd", width: 1254, height: 1254, alphaBounds: { minX: 245, minY: 395, maxXInclusive: 1002, maxYInclusive: 849 }, transparentPixelCount: 1276227, partialAlphaPixelCount: 2668 },
      right: { sha256: "0253eac6015164e531f503807fbe55c9e5b316b27f0fcc14d6dc80615823b4e2", width: 1254, height: 1254, alphaBounds: { minX: 297, minY: 453, maxXInclusive: 958, maxYInclusive: 842 }, transparentPixelCount: 1345217, partialAlphaPixelCount: 2407 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_soft_floor_cushion_a",
    categoryLabel: "Universal soft floor cushion",
    // The production plan treats this as floor decor. Keep it non-seatable
    // until a deliberate interaction contract is added instead of silently
    // requiring a sitting pose for a cushion prop.
    isSeatable: false,
    technicalEvidenceOverrides: { hasCleanAlpha: false, hasNoHalo: false },
    artifactBaselinesByRotation: {
      front: { sha256: "042e4401e64094a67f4fed9e96f6c061d9a70d97f29b03854dda14e2402ae0b8", width: 1254, height: 1254, alphaBounds: { minX: 126, minY: 407, maxXInclusive: 1131, maxYInclusive: 985 }, transparentPixelCount: 1041392, partialAlphaPixelCount: 2473 },
      back: { sha256: "b9c3f5bedcadf4fa6f1013fd15056f04ed76aee94f963aa0162e212f361b0226", width: 1254, height: 1254, alphaBounds: { minX: 123, minY: 409, maxXInclusive: 1130, maxYInclusive: 990 }, transparentPixelCount: 1039598, partialAlphaPixelCount: 2696 },
      left: { sha256: "1be9878b06730598cf649a453a940067a951af2c502385eea7685cb9e7aca540", width: 1254, height: 1254, alphaBounds: { minX: 112, minY: 456, maxXInclusive: 1140, maxYInclusive: 838 }, transparentPixelCount: 1212773, partialAlphaPixelCount: 2092 },
      right: { sha256: "1486d32c7899f932da4f59bebc801d8a41459303b00626d39f35963f5fe3a286", width: 1254, height: 1254, alphaBounds: { minX: 98, minY: 473, maxXInclusive: 1157, maxYInclusive: 863 }, transparentPixelCount: 1192059, partialAlphaPixelCount: 2068 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_pet_bed_a",
    categoryLabel: "Universal pet bed",
    isSeatable: false,
    technicalEvidenceOverrides: { hasCleanAlpha: false, hasNoHalo: false },
    artifactBaselinesByRotation: {
      front: { sha256: "8d242e209f11cd17a1b20338a9994ade127c752084dc464e9dea33a3ee795b3a", width: 1254, height: 1254, alphaBounds: { minX: 61, minY: 414, maxXInclusive: 1192, maxYInclusive: 1018 }, transparentPixelCount: 968959, partialAlphaPixelCount: 2539 },
      back: { sha256: "485f5a5b309bbbcd6ba4b672144d16266ae908e27ca2b5a13dfc3e4a1f1fe828", width: 1254, height: 1254, alphaBounds: { minX: 62, minY: 473, maxXInclusive: 1192, maxYInclusive: 1019 }, transparentPixelCount: 1031781, partialAlphaPixelCount: 2413 },
      left: { sha256: "b1a654d085b04745a199bb1173ac602ac5087034d89f97e33b5310888117ad62", width: 1254, height: 1254, alphaBounds: { minX: 103, minY: 383, maxXInclusive: 1148, maxYInclusive: 884 }, transparentPixelCount: 1114709, partialAlphaPixelCount: 2226 },
      right: { sha256: "9840d806a5a439c70060dbd7450be53c54e919d19f121dc90c92cf5484efbed0", width: 1254, height: 1254, alphaBounds: { minX: 107, minY: 411, maxXInclusive: 1155, maxYInclusive: 907 }, transparentPixelCount: 1106713, partialAlphaPixelCount: 2930 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_long_sofa_a",
    categoryLabel: "Universal long sofa",
    isSeatable: true,
    technicalEvidenceOverrides: { hasCleanAlpha: false, hasNoHalo: false },
    artifactBaselinesByRotation: {
      front: { sha256: "621c2ca1815d49a2ca000d79dceab5377e906d5c4fc9a72bf2d76178a8c98037", width: 2475, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2450, maxYInclusive: 975 }, transparentPixelCount: 362235, partialAlphaPixelCount: 22333 },
      back: { sha256: "64e728535c8f2f4e33defa7c6038c5ccea436fe04f477bf6667732244450587b", width: 2266, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2241, maxYInclusive: 975 }, transparentPixelCount: 472181, partialAlphaPixelCount: 20671 },
      left: { sha256: "da4f3559a589d5264468803df1f086112dd8555cf820f99d63a023e3663b1309", width: 1862, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1837, maxYInclusive: 975 }, transparentPixelCount: 493607, partialAlphaPixelCount: 13733 },
      right: { sha256: "d8d5f8097a30399798d790430c38a8710a587d43546cfadb9df7d34f2fb91f42", width: 2013, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1988, maxYInclusive: 975 }, transparentPixelCount: 488844, partialAlphaPixelCount: 15053 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_lounge_armchair_a",
    categoryLabel: "Universal lounge armchair",
    isSeatable: true,
    technicalEvidenceOverrides: { hasCleanAlpha: false, hasNoHalo: false },
    artifactBaselinesByRotation: {
      front: { sha256: "fcd4fd1c8eb5a7fb5882069eaf16e7a6a72920ca9e142f9dbcf25f3f2569f285", width: 1009, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 984, maxYInclusive: 975 }, transparentPixelCount: 268555, partialAlphaPixelCount: 7191 },
      back: { sha256: "e0138322c5921121e08c8c802780487d129b6a6b9d375cc6e9f28c50bb2b3e9f", width: 1085, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1060, maxYInclusive: 975 }, transparentPixelCount: 178082, partialAlphaPixelCount: 9672 },
      left: { sha256: "9c03b17d06a09ee54ef8570a642ee03008201286c63dc81683a35dc34567e415", width: 1054, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1029, maxYInclusive: 975 }, transparentPixelCount: 448410, partialAlphaPixelCount: 13947 },
      right: { sha256: "50ef09efc2743c846e880ecf7123f0d13ccc567653577b9397418b0875644000", width: 943, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 918, maxYInclusive: 975 }, transparentPixelCount: 392254, partialAlphaPixelCount: 9140 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_cloud_bed_b",
    categoryLabel: "Universal double bed",
    isSeatable: true,
    artifactBaselinesByRotation: {
      front: { sha256: "c1f4b6fabc607f3269ef841eed2816b4bd736b134ec7bdd52a7a3cf4bc0aecc4", width: 1254, height: 1254, alphaBounds: { minX: 19, minY: 387, maxXInclusive: 1068, maxYInclusive: 1110 }, transparentPixelCount: 1101015, partialAlphaPixelCount: 9520 },
      back: { sha256: "905becbc99db5f1724fe15324f168fbaf81c3afb3ffce97e20ca1c63462dbe8f", width: 1254, height: 1254, alphaBounds: { minX: 102, minY: 437, maxXInclusive: 1151, maxYInclusive: 1110 }, transparentPixelCount: 1130670, partialAlphaPixelCount: 4951 },
      left: { sha256: "3b5d658fe9d8417a2ed879d0ccc2a0cb350de87dae72fda75828ff8fb34f0d6d", width: 1254, height: 1254, alphaBounds: { minX: 102, minY: 395, maxXInclusive: 1151, maxYInclusive: 1110 }, transparentPixelCount: 1141689, partialAlphaPixelCount: 9592 },
      right: { sha256: "286cc6c6c76eb8bc2f169121d092a67a09ad6956ad6c63057839851fb97e6535", width: 1254, height: 1254, alphaBounds: { minX: 102, minY: 481, maxXInclusive: 1151, maxYInclusive: 1110 }, transparentPixelCount: 1193685, partialAlphaPixelCount: 9514 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_rounded_wardrobe_a",
    categoryLabel: "Universal wardrobe",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "bb4121c0dc862aaf908c3f385812ce95d0b69750c175d3f70330d293becd1eac", width: 1254, height: 1254, alphaBounds: { minX: 317, minY: 67, maxXInclusive: 936, maxYInclusive: 1110 }, transparentPixelCount: 962222, partialAlphaPixelCount: 8806 },
      back: { sha256: "00ee5c20b82b9046b6b64f95b65d4ee43fd8f77a39a6517cdf376fbfba59f511", width: 1254, height: 1254, alphaBounds: { minX: 328, minY: 67, maxXInclusive: 925, maxYInclusive: 1110 }, transparentPixelCount: 982074, partialAlphaPixelCount: 6305 },
      left: { sha256: "affde81eda92f3856441cf1a9606aa9bf3aa58c191725425445ba33f89f1859a", width: 1254, height: 1254, alphaBounds: { minX: 317, minY: 67, maxXInclusive: 935, maxYInclusive: 1110 }, transparentPixelCount: 985927, partialAlphaPixelCount: 9195 },
      right: { sha256: "432a59a0bfe2fde452e7afcfd9d89da31f6187c09a4aff3a0bfd87c814f628aa", width: 1254, height: 1254, alphaBounds: { minX: 307, minY: 67, maxXInclusive: 946, maxYInclusive: 1110 }, transparentPixelCount: 972367, partialAlphaPixelCount: 11461 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_soft_media_console_a",
    categoryLabel: "Universal media console",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "1f308530ee4c224d0eec261fe56bbc533832b042928abd5274e68cf54715709c", width: 1254, height: 1254, alphaBounds: { minX: 60, minY: 694, maxXInclusive: 1189, maxYInclusive: 1110 }, transparentPixelCount: 1150818, partialAlphaPixelCount: 9224 },
      back: { sha256: "d38828be2de0a07da458e8156a9bee4d911a58c116909d01a36ccdb12793a283", width: 1254, height: 1254, alphaBounds: { minX: 55, minY: 796, maxXInclusive: 1196, maxYInclusive: 1110 }, transparentPixelCount: 1243663, partialAlphaPixelCount: 9171 },
      left: { sha256: "3a9799c1e9dcd1e0b076c754d0bf516a75df5566780901945b7fcc229705ad2c", width: 1254, height: 1254, alphaBounds: { minX: 281, minY: 649, maxXInclusive: 955, maxYInclusive: 1110 }, transparentPixelCount: 1296190, partialAlphaPixelCount: 1470 },
      right: { sha256: "7aeed05cfab0fcccb92dfbc76fffd6038f0789d5ac7d951161505732699d0a84", width: 1254, height: 1254, alphaBounds: { minX: 270, minY: 667, maxXInclusive: 983, maxYInclusive: 1110 }, transparentPixelCount: 1281212, partialAlphaPixelCount: 1454 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_soft_coat_stand_a",
    categoryLabel: "Universal coat stand",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "5e3c387723f95c25c2d0c147e070c0ea02774081db49e67d9b35beb93986176e", width: 1254, height: 1254, alphaBounds: { minX: 479, minY: 111, maxXInclusive: 773, maxYInclusive: 1110 }, transparentPixelCount: 1489578, partialAlphaPixelCount: 11750 },
      back: { sha256: "e3d1cceae5f6a1f5cadf9fc025df2fbbcb49ffea5c81e4f181b45802fbb2ec6f", width: 1254, height: 1254, alphaBounds: { minX: 503, minY: 111, maxXInclusive: 749, maxYInclusive: 1110 }, transparentPixelCount: 1515278, partialAlphaPixelCount: 11449 },
      left: { sha256: "b80c9517d3d96f63fe1ab39a13f74a0fa199e47587b84669c39c8872f99643bc", width: 1254, height: 1254, alphaBounds: { minX: 520, minY: 111, maxXInclusive: 733, maxYInclusive: 1110 }, transparentPixelCount: 1523011, partialAlphaPixelCount: 10451 },
      right: { sha256: "48145b52a16b8601a8873668defe3ce4badbf855f85d1737179bc33ea7ed8efe", width: 1254, height: 1254, alphaBounds: { minX: 483, minY: 111, maxXInclusive: 769, maxYInclusive: 1110 }, transparentPixelCount: 1512897, partialAlphaPixelCount: 11271 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_soft_pouf_b",
    categoryLabel: "Universal ottoman pouf",
    isSeatable: true,
    artifactBaselinesByRotation: {
      front: { sha256: "fd71602f8f51423892ce8b5d46b9cc35b40e164d12ed4b87d49775d140782bf4", width: 1254, height: 1254, alphaBounds: { minX: 139, minY: 401, maxXInclusive: 1114, maxYInclusive: 1110 }, transparentPixelCount: 977097, partialAlphaPixelCount: 1837 },
      back: { sha256: "17e8cba625ee82678d24753b7a2de60f98f123d0409c96b62f316026196175f3", width: 1402, height: 1122, alphaBounds: { minX: 183, minY: 439, maxXInclusive: 1223, maxYInclusive: 1110 }, transparentPixelCount: 981481, partialAlphaPixelCount: 2517 },
      left: { sha256: "e043ceaee1554ca0b8f691bec022b635ef52b65efd2e968dfe895c492d729d29", width: 1254, height: 1254, alphaBounds: { minX: 198, minY: 536, maxXInclusive: 1066, maxYInclusive: 1110 }, transparentPixelCount: 1151045, partialAlphaPixelCount: 1518 },
      right: { sha256: "5d20b328aa106ff86010b732f8f6adc83df0bc504b0ac50072b44fc6d375c54e", width: 1254, height: 1254, alphaBounds: { minX: 137, minY: 491, maxXInclusive: 1115, maxYInclusive: 1110 }, transparentPixelCount: 1050847, partialAlphaPixelCount: 1269 }
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_arch_wall_mirror_a",
    categoryLabel: "Universal wall mirror",
    placementSurface: "wall",
    artifactBaseline: {
      sha256: "efe07d00c9ede13351f97baf5661718d6565b6e6b57d28fd183c5498735b1fad",
      width: 1024,
      height: 1536,
      alphaBounds: { minX: 123, minY: 112, maxXInclusive: 899, maxYInclusive: 1391 },
      transparentPixelCount: 644200,
      partialAlphaPixelCount: 3252
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_storage_cabinet_a",
    categoryLabel: "Universal storage cabinet",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "d1180a376747904dfb7a2c75b9813f07e40ed3c67cebd7b4079db8df0e62826b", width: 1536, height: 1024, alphaBounds: { minX: 154, minY: 140, maxXInclusive: 1385, maxYInclusive: 882 }, transparentPixelCount: 733447, partialAlphaPixelCount: 5158 },
      back: { sha256: "1f67760abea83d554f2b345bbda685ca19b5cba905110411c43184a1aaa97831", width: 1122, height: 1402, alphaBounds: { minX: 92, minY: 214, maxXInclusive: 1029, maxYInclusive: 1161 }, transparentPixelCount: 737293, partialAlphaPixelCount: 4159 },
      left: { sha256: "259b979fd5b815448dadae8064cfab63299c66212eb9888f1199e3485a0edc16", width: 1024, height: 1536, alphaBounds: { minX: 316, minY: 82, maxXInclusive: 705, maxYInclusive: 1453 }, transparentPixelCount: 1083611, partialAlphaPixelCount: 3692 },
      right: { sha256: "4da512e6f1d5824211a705ae56ff096df86215092dd14dec0d7122f586c539ad", width: 1024, height: 1536, alphaBounds: { minX: 232, minY: 136, maxXInclusive: 790, maxYInclusive: 1347 }, transparentPixelCount: 961158, partialAlphaPixelCount: 3701 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_nightstand_a",
    categoryLabel: "Universal nightstand",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "88d78cd62540ced0891cc26775597242f4e6b6de3f2f55a8082a740ba56623c5", width: 1024, height: 1536, alphaBounds: { minX: 99, minY: 243, maxXInclusive: 926, maxYInclusive: 1259 }, transparentPixelCount: 861496, partialAlphaPixelCount: 3931 },
      back: { sha256: "ab6dcca81afc1fbae4a1a296575d4b11005318dfd102ed41361b40ffff7f9881", width: 1122, height: 1402, alphaBounds: { minX: 133, minY: 185, maxXInclusive: 986, maxYInclusive: 1220 }, transparentPixelCount: 809519, partialAlphaPixelCount: 5542 },
      left: { sha256: "3ddc5a1436f7ce213450d196c94a1c3f61952c24135faae5f2d942925f2da4fd", width: 1024, height: 1536, alphaBounds: { minX: 271, minY: 305, maxXInclusive: 760, maxYInclusive: 1249 }, transparentPixelCount: 1183977, partialAlphaPixelCount: 3255 },
      right: { sha256: "12bdd94b82b0fa5ae72635cb10d7ce4b180507f6bc338dcfa81dfb5917c5365d", width: 1024, height: 1536, alphaBounds: { minX: 261, minY: 240, maxXInclusive: 769, maxYInclusive: 1230 }, transparentPixelCount: 1148077, partialAlphaPixelCount: 3552 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_laundry_basket_a",
    categoryLabel: "Universal laundry basket",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "2d16d2ca71275cbf5f357ec26e06332e13c862e22b6837b4f8c3801f0c9aa17a", width: 1024, height: 1536, alphaBounds: { minX: 79, minY: 217, maxXInclusive: 944, maxYInclusive: 1326 }, transparentPixelCount: 761572, partialAlphaPixelCount: 4311 },
      back: { sha256: "e802ad21a257f6b7a77421e76f00426e041c3edd753093bfc5cad62ee98d0b4c", width: 1024, height: 1536, alphaBounds: { minX: 125, minY: 187, maxXInclusive: 902, maxYInclusive: 1324 }, transparentPixelCount: 818384, partialAlphaPixelCount: 4226 },
      left: { sha256: "c682f4104a573606dbf962077d6dbd7b4353fc62417f2097a5e8a1737e37dfe9", width: 1024, height: 1536, alphaBounds: { minX: 263, minY: 208, maxXInclusive: 702, maxYInclusive: 1320 }, transparentPixelCount: 1175083, partialAlphaPixelCount: 3090 },
      right: { sha256: "69080e7452b4bef2a814c30b7682e34cfa0d1b5e4618a91fab05ea3a5a880a65", width: 1024, height: 1536, alphaBounds: { minX: 360, minY: 147, maxXInclusive: 700, maxYInclusive: 1367 }, transparentPixelCount: 1213493, partialAlphaPixelCount: 4591 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_vanity_table_a",
    categoryLabel: "Universal vanity table",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "5956a3b22742b14ab7e89db1756d3696090b8a677ddb9fa489a320846e8fe3b5", width: 1024, height: 1536, alphaBounds: { minX: 42, minY: 348, maxXInclusive: 982, maxYInclusive: 1170 }, transparentPixelCount: 1194702, partialAlphaPixelCount: 4696 },
      back: { sha256: "9e4ed6f7d67fffba992033a6a04ad024999ac3fa5c0ef82df8a8646ab4a54e32", width: 1024, height: 1536, alphaBounds: { minX: 44, minY: 353, maxXInclusive: 977, maxYInclusive: 1168 }, transparentPixelCount: 1247463, partialAlphaPixelCount: 4458 },
      left: { sha256: "f905e03da638b9831577c1cb43c80a1e18f8aaf219965bc5faa093f0e401f063", width: 1024, height: 1536, alphaBounds: { minX: 275, minY: 220, maxXInclusive: 739, maxYInclusive: 1262 }, transparentPixelCount: 1301365, partialAlphaPixelCount: 4091 },
      right: { sha256: "a9c53a3d6bf0d0b6c3d59c5eb16fb013ac9cac84737ddd2e591015ae92b8022a", width: 1024, height: 1536, alphaBounds: { minX: 237, minY: 214, maxXInclusive: 787, maxYInclusive: 1287 }, transparentPixelCount: 1265118, partialAlphaPixelCount: 4786 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_shoe_cabinet_a",
    categoryLabel: "Universal shoe cabinet",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "187f1a3b0fd8c81f2f98be5c94a5bfd49e589b298a8be5181c40fc5cde938185", width: 1024, height: 1536, alphaBounds: { minX: 122, minY: 184, maxXInclusive: 901, maxYInclusive: 1351 }, transparentPixelCount: 720929, partialAlphaPixelCount: 5011 },
      back: { sha256: "9783ed2219a1af1960ec805d591117aac8b6c15a0e3225b70024b1d333cecd17", width: 1024, height: 1536, alphaBounds: { minX: 157, minY: 128, maxXInclusive: 867, maxYInclusive: 1403 }, transparentPixelCount: 733618, partialAlphaPixelCount: 3792 },
      left: { sha256: "5ab2349564fb5e7ef83fcfe67c1ca286255b7e07e4e8c2dc8b140de7a95ae2ed", width: 1024, height: 1536, alphaBounds: { minX: 341, minY: 109, maxXInclusive: 660, maxYInclusive: 1415 }, transparentPixelCount: 1203210, partialAlphaPixelCount: 3372 },
      right: { sha256: "b07d35c28351c11ce4fc22c4c2d80f4eb7557e7c7988d8d654b1f22da89c6f33", width: 1024, height: 1536, alphaBounds: { minX: 354, minY: 96, maxXInclusive: 674, maxYInclusive: 1393 }, transparentPixelCount: 1198130, partialAlphaPixelCount: 3443 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_dresser_a",
    categoryLabel: "Universal dresser",
    isSeatable: false,
    artifactBaselinesByRotation: {
      front: { sha256: "ce301a9eb4f0ff77083af88890e0361d35f548fdf6e5f16d316733f02c749f76", width: 1536, height: 1024, alphaBounds: { minX: 113, minY: 185, maxXInclusive: 1422, maxYInclusive: 828 }, transparentPixelCount: 835312, partialAlphaPixelCount: 4650 },
      back: { sha256: "92949b4719fc73a897bc267e2de3dbd11e4b076b90234d1522d41808fe5c5e15", width: 1536, height: 1024, alphaBounds: { minX: 142, minY: 115, maxXInclusive: 1393, maxYInclusive: 908 }, transparentPixelCount: 693415, partialAlphaPixelCount: 4261 },
      left: { sha256: "df5c946bf30f5b08c2c1f3f2a16296c2aae7cd3a32b393252fd2294f81e2ac50", width: 1122, height: 1402, alphaBounds: { minX: 290, minY: 122, maxXInclusive: 839, maxYInclusive: 1284 }, transparentPixelCount: 1005533, partialAlphaPixelCount: 4856 },
      right: { sha256: "bcbd419a73f7451ccafb4c4d7841f850e6800510acf70346a651e6778461f5f2", width: 1149, height: 1369, alphaBounds: { minX: 320, minY: 119, maxXInclusive: 830, maxYInclusive: 1247 }, transparentPixelCount: 1065587, partialAlphaPixelCount: 4891 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_console_table_a",
    categoryLabel: "Universal console table",
    isSeatable: false,
    artifactVersion: "runtime_v2",
    // The independent visual review found a visible chroma fringe and
    // direction/scale defects. Keep the runtime-v2 artifacts immutable while
    // preventing an evidence-only promotion until they are re-authored.
    technicalEvidenceOverrides: { hasNoHalo: false },
    artEvidenceOverrides: {
      hasStrongMobileSilhouette: false,
      directionsAreGenuine: false
    },
    artifactBaselinesByRotation: {
      front: { sha256: "48b97b24c9f90d648307850eba3fffa5c777c3a9edb4d8135e0f63933aedaf76", width: 2789, height: 1000, alphaBounds: { minX: 24, minY: 25, maxXInclusive: 2764, maxYInclusive: 975 }, transparentPixelCount: 562244, partialAlphaPixelCount: 25682 },
      back: { sha256: "e9ada180d2f8833ef50676a812622c9099fce868b416b4a9430dfa579cb8ec0e", width: 2718, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2693, maxYInclusive: 975 }, transparentPixelCount: 557141, partialAlphaPixelCount: 27182 },
      left: { sha256: "db82b7e3a98adeddedc09ac33e74a8f0c217b3dcd4af2cf3873364b21416c122", width: 793, height: 1000, alphaBounds: { minX: 24, minY: 25, maxXInclusive: 768, maxYInclusive: 975 }, transparentPixelCount: 187976, partialAlphaPixelCount: 8530 },
      right: { sha256: "981240b9996fefc074ea9ea5ca66351bc90497589b8f75edb98ae8d068e61202", width: 650, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 625, maxYInclusive: 975 }, transparentPixelCount: 179020, partialAlphaPixelCount: 7767 }
    }
  }),
  createUniversalDirectionalCandidate({
    id: "universal_large_standing_plant_a",
    categoryLabel: "Universal large standing plant",
    isSeatable: false,
    artifactVersion: "runtime_v2",
    // The current plant is too photorealistic/noisy at mobile size and its
    // four directions do not share a true isometric construction.
    technicalEvidenceOverrides: { hasNoHalo: false },
    artEvidenceOverrides: {
      matchesBlumiPainterlyStyle: false,
      hasStrongMobileSilhouette: false,
      directionsAreGenuine: false
    },
    artifactBaselinesByRotation: {
      front: { sha256: "42ed705932ddd678276a1bcb0fac0bad9571abb380aef41cbf30c5c8952c4f1e", width: 465, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 440, maxYInclusive: 975 }, transparentPixelCount: 229699, partialAlphaPixelCount: 45028 },
      back: { sha256: "ce767ffe49112dbebd3f97852449ca955756820200e456df8cb873bbd61e45da", width: 437, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 412, maxYInclusive: 975 }, transparentPixelCount: 219170, partialAlphaPixelCount: 56568 },
      left: { sha256: "5a1fe4e414ec311648fd3a06797a1eb4f0efa30272260543a70acea26f6825d9", width: 321, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 296, maxYInclusive: 975 }, transparentPixelCount: 145558, partialAlphaPixelCount: 73292 },
      right: { sha256: "6eb4dad7721abc0cc1491189019ed8f34a8b1d5d2544740e6638313690f971d5", width: 289, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 264, maxYInclusive: 975 }, transparentPixelCount: 127312, partialAlphaPixelCount: 44619 }
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_wall_artwork_a",
    categoryLabel: "Universal wall artwork",
    placementSurface: "wall",
    artifactBaseline: {
      sha256: "538bb0f3b46e34c1d8a25bd098780278697f12448b909a47bc467d469e85e5d8",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 249, minY: 74, maxXInclusive: 1002, maxYInclusive: 1176 },
      transparentPixelCount: 768328,
      partialAlphaPixelCount: 4007
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_ceiling_light_a",
    categoryLabel: "Universal ceiling light",
    placementSurface: "ceiling",
    artifactBaseline: {
      sha256: "a86a67b3cd78e441deb96fe90b96a1c29b0902be495d35b16e5900ea6f183d83",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 223, minY: 99, maxXInclusive: 1020, maxYInclusive: 1157 },
      transparentPixelCount: 995704,
      partialAlphaPixelCount: 4249
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_curtain_set_a",
    categoryLabel: "Universal curtain set",
    placementSurface: "wall",
    artifactVersion: "runtime_v2",
    technicalEvidenceOverrides: { hasNoHalo: false },
    artifactBaseline: {
      sha256: "9c35600308e5ab5c9216a94a0697359c3cea76b75b2ff421ff08ff57a57b8a13",
      width: 883,
      height: 1000,
      alphaBounds: { minX: 24, minY: 24, maxXInclusive: 858, maxYInclusive: 975 },
      transparentPixelCount: 438100,
      partialAlphaPixelCount: 18981
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_decorative_object_set_a",
    categoryLabel: "Universal decorative object set",
    placementSurface: "tabletop",
    artifactVersion: "runtime_v2",
    technicalEvidenceOverrides: { hasNoHalo: false },
    artifactBaseline: {
      sha256: "8d80abd03a02b98934db2d1aca38bea1a483220fedf0cb802713c0050caf439d",
      width: 1496,
      height: 1000,
      alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1471, maxYInclusive: 975 },
      transparentPixelCount: 481324,
      partialAlphaPixelCount: 10320
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_small_speaker_a",
    categoryLabel: "Universal small speaker",
    placementSurface: "floor",
    artifactBaseline: {
      sha256: "1aadc26cecdd46fd09236d3da01395d75a01f3ac05199a11e8ec3045f8435521",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 244, minY: 234, maxXInclusive: 1020, maxYInclusive: 1110 },
      transparentPixelCount: 964313,
      partialAlphaPixelCount: 2174
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_rug_a",
    categoryLabel: "Universal oval rug",
    placementSurface: "floor",
    artifactBaseline: {
      sha256: "ff016b98871290744b862ede0a3a3b84b5ec12465f6114ee670ce40abcb57a73",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 11, minY: 194, maxXInclusive: 1241, maxYInclusive: 1047 },
      transparentPixelCount: 675498,
      partialAlphaPixelCount: 4169
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_cushion_set_a",
    categoryLabel: "Universal cushion set",
    placementSurface: "floor",
    requiresDirectionalAssets: false,
    artifactBaseline: {
      sha256: "bcc2bfc324b95aa27419fe14d8b1ebccb4d318f45c29d87e3f57c2d2ea03a20b",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 100, minY: 387, maxXInclusive: 1153, maxYInclusive: 906 },
      transparentPixelCount: 1094295,
      partialAlphaPixelCount: 3863
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_full_length_mirror_a",
    categoryLabel: "Universal full-length mirror",
    placementSurface: "floor",
    artifactBaseline: {
      sha256: "e9578ed29244fa2272daa2c7ad613ff305acdfff0247e130b31023fe5694d63c",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 332, minY: 35, maxXInclusive: 927, maxYInclusive: 1220 },
      transparentPixelCount: 1068079,
      partialAlphaPixelCount: 3556
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_open_display_shelf_a",
    categoryLabel: "Universal open display shelf",
    placementSurface: "floor",
    artifactBaseline: {
      sha256: "4914c12f1ff1097bdbfc9acb71982cde50ba5c4c6b79db44ec44e8417eddd123",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 244, minY: 100, maxXInclusive: 1044, maxYInclusive: 1171 },
      transparentPixelCount: 995922,
      partialAlphaPixelCount: 10187
    }
  }),
  createUniversalSurfaceCandidate({
    id: "universal_room_divider_a",
    categoryLabel: "Universal room divider",
    placementSurface: "floor",
    artifactBaseline: {
      sha256: "5b5b32169660bb4731007ee91c7016694b2e726d02143c6bbb9377e57cad5601",
      width: 1254,
      height: 1254,
      alphaBounds: { minX: 158, minY: 124, maxXInclusive: 1099, maxYInclusive: 1160 },
      transparentPixelCount: 718438,
      partialAlphaPixelCount: 4585
    }
  }),
  {
    id: "cocoa_lounge_armchair_a",
    homeTheme: "cocoa_navy_modern_studio",
    categoryLabel: "Lounge armchair",
    isSeatable: true,
    assetPathsByRotation: {
      front: "assets/runtime/candidates/cocoa_lounge_armchair_a/cocoa_lounge_armchair_a_front.png",
      left: "assets/runtime/candidates/cocoa_lounge_armchair_a/cocoa_lounge_armchair_a_left.png",
      right: "assets/runtime/candidates/cocoa_lounge_armchair_a/cocoa_lounge_armchair_a_right.png"
    }
  }
]

interface UniversalDirectionalCandidateSpec {
  id: Extract<RoomV3FurniturePilotCandidateId, `universal_${string}`>
  categoryLabel: string
  isSeatable: boolean
  artifactBaselinesByRotation: Record<RoomFurnitureRotation, RoomV3FurnitureArtifactBaseline>
  artifactVersion?: "pilot_v1" | "runtime_v2"
  technicalEvidenceOverrides?: Partial<RoomV3FurnitureTechnicalEvidence>
  artEvidenceOverrides?: Partial<RoomV3FurnitureArtEvidence>
}

function createUniversalDirectionalCandidate(
  spec: UniversalDirectionalCandidateSpec
): RoomV3FurniturePilotCandidate {
  const prefix = `assets/runtime/candidates/${spec.id}/${spec.id}`
  const artifactVersion = spec.artifactVersion ?? "pilot_v1"
  return {
    id: spec.id,
    homeTheme: "universal_core",
    categoryLabel: spec.categoryLabel,
    isSeatable: spec.isSeatable,
    assetPathsByRotation: {
      front: `${prefix}_front_${artifactVersion}.png`,
      back: `${prefix}_back_${artifactVersion}.png`,
      left: `${prefix}_left_${artifactVersion}.png`,
      right: `${prefix}_right_${artifactVersion}.png`
    },
    artifactBaselinesByRotation: spec.artifactBaselinesByRotation,
    technicalEvidence: {
      ...universalTechnicalEvidence(`${spec.id}-alpha-grounding-${artifactVersion}`),
      ...spec.technicalEvidenceOverrides
    },
    artEvidence: {
      ...universalArtEvidence(`${spec.id}-independent-visual-review-${artifactVersion}`),
      ...spec.artEvidenceOverrides
    }
  }
}

interface UniversalSurfaceCandidateSpec {
  id: Extract<RoomV3FurniturePilotCandidateId, `universal_${string}`>
  categoryLabel: string
  placementSurface: RoomPlacementSurface
  artifactBaseline: RoomV3FurnitureArtifactBaseline
  artifactVersion?: "pilot_v1" | "runtime_v2"
  /** A floor prop may still be intentionally front-only (for example cushions). */
  requiresDirectionalAssets?: boolean
  technicalEvidenceOverrides?: Partial<RoomV3FurnitureTechnicalEvidence>
  artEvidenceOverrides?: Partial<RoomV3FurnitureArtEvidence>
}

function createUniversalSurfaceCandidate(
  spec: UniversalSurfaceCandidateSpec
): RoomV3FurniturePilotCandidate {
  const prefix = `assets/runtime/candidates/${spec.id}/${spec.id}`
  const artifactVersion = spec.artifactVersion ?? "pilot_v1"
  return {
    id: spec.id,
    homeTheme: "universal_core",
    categoryLabel: spec.categoryLabel,
    isSeatable: false,
    requiresDirectionalAssets: spec.requiresDirectionalAssets ?? spec.placementSurface === "floor",
    placementSurface: spec.placementSurface,
    assetPathsByRotation: {
      front: `${prefix}_front_${artifactVersion}.png`
    },
    artifactBaselinesByRotation: {
      front: spec.artifactBaseline
    },
    technicalEvidence: {
      ...universalTechnicalEvidence(`${spec.id}-alpha-grounding-${artifactVersion}`),
      ...spec.technicalEvidenceOverrides
    },
    artEvidence: {
      ...universalArtEvidence(`${spec.id}-independent-visual-review-${artifactVersion}`),
      ...spec.artEvidenceOverrides
    }
  }
}

export function validateRoomV3FurnitureCandidate(
  candidate: RoomV3FurniturePilotCandidate
): RoomV3FurnitureCandidateValidation {
  const issueIds: RoomV3FurnitureCandidateIssueId[] = []
  const collection = ROOM_V3_HOME_COLLECTIONS.find(
    (home) => home.id === candidate.homeTheme
  )
  const isUniversalCore = candidate.homeTheme === "universal_core"

  if (!collection && !isUniversalCore) issueIds.push("unknown_home_theme")

  const requiredRotations = candidate.requiresDirectionalAssets === false
    ? (["front"] as const)
    : REQUIRED_ROTATIONS
  const directionalPaths = requiredRotations.map(
    (rotation) => candidate.assetPathsByRotation[rotation]?.trim() ?? ""
  )
  if (directionalPaths.some((path) => !path)) {
    issueIds.push("missing_directional_asset")
  } else if (new Set(directionalPaths).size !== directionalPaths.length) {
    issueIds.push("reused_directional_asset")
  }

  if (!hasEveryDirectionalArtifactBaseline(candidate.artifactBaselinesByRotation, requiredRotations)) {
    issueIds.push("missing_verified_asset_hashes")
  }
  if (!hasConsistentFloorContactLine(candidate.artifactBaselinesByRotation, requiredRotations)) {
    issueIds.push("inconsistent_floor_contact_line")
  }

  if (!hasPassingTechnicalEvidence(candidate.technicalEvidence)) {
    issueIds.push("missing_alpha_or_grounding_review")
  }

  if (!candidate.artEvidence?.matchesBlumiPainterlyStyle) {
    issueIds.push("style_review_not_approved")
  }
  if (!candidate.artEvidence?.hasStrongMobileSilhouette) {
    issueIds.push("missing_mobile_readability_review")
  }
  if (
    candidate.requiresDirectionalAssets !== false &&
    !candidate.artEvidence?.directionsAreGenuine
  ) {
    issueIds.push("directional_art_not_verified")
  }
  if (collection && !matchesCollectionMaterials(candidate.artEvidence, collection)) {
    issueIds.push("collection_material_mismatch")
  }
  if (
    isUniversalCore &&
    !matchesRequiredMaterials(
      candidate.artEvidence,
      ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.requiredMaterialFamilies
    )
  ) {
    issueIds.push("collection_material_mismatch")
  }

  if (!hasEvidenceId(candidate.runtimeEvidence?.scaleSceneEvidenceId)) {
    issueIds.push("missing_runtime_scale_evidence")
  }
  if (!hasEvidenceId(candidate.runtimeEvidence?.depthLaneEvidenceId)) {
    issueIds.push("missing_depth_lane_evidence")
  }
  if (!hasEvidenceId(candidate.runtimeEvidence?.collisionEvidenceId)) {
    issueIds.push("missing_collision_evidence")
  }
  if (candidate.isSeatable && !hasEvidenceId(candidate.runtimeEvidence?.seatingEvidenceId)) {
    issueIds.push("missing_seating_evidence")
  }
  if (!hasEvidenceId(candidate.runtimeEvidence?.simulatorEvidenceId)) {
    issueIds.push("missing_simulator_evidence")
  }
  if (!hasEvidenceId(candidate.runtimeEvidence?.independentReviewId)) {
    issueIds.push("missing_independent_review")
  }

  const hasCompleteDeclaredEvidence = issueIds.length === 0

  // This gate validates the declared evidence only. The build-time artifact
  // verifier must still read the PNGs, hashes, alpha bounds, and QA artifacts
  // before anything can enter the real Room V2 catalog.
  issueIds.push("artifact_verifier_required")

  return {
    hasCompleteDeclaredEvidence,
    isReadyForRuntime: false,
    issueIds
  }
}

function hasEveryDirectionalArtifactBaseline(
  baselines: RoomV3FurniturePilotCandidate["artifactBaselinesByRotation"],
  requiredRotations: readonly RoomFurnitureRotation[] = REQUIRED_ROTATIONS
): boolean {
  return requiredRotations.every((rotation) => isArtifactBaseline(baselines?.[rotation]))
}

function hasConsistentFloorContactLine(
  baselines: RoomV3FurniturePilotCandidate["artifactBaselinesByRotation"],
  requiredRotations: readonly RoomFurnitureRotation[] = REQUIRED_ROTATIONS
): boolean {
  const floorContactLines = requiredRotations.map(
    (rotation) => baselines?.[rotation]?.alphaBounds.maxYInclusive
  )

  // Missing or malformed baselines are already reported separately. Keep this
  // diagnostic precise so it only rejects a verified cross-rotation drift.
  if (floorContactLines.some((line) => !Number.isInteger(line))) return true

  const lines = floorContactLines as number[]
  return Math.max(...lines) - Math.min(...lines) <= MAX_FLOOR_CONTACT_DRIFT_PX
}

function isArtifactBaseline(
  baseline: RoomV3FurnitureArtifactBaseline | undefined
): boolean {
  return Boolean(
    baseline &&
      /^[a-f0-9]{64}$/.test(baseline.sha256) &&
      Number.isInteger(baseline.width) &&
      baseline.width > 0 &&
      Number.isInteger(baseline.height) &&
      baseline.height > 0 &&
      Number.isInteger(baseline.alphaBounds.minX) &&
      Number.isInteger(baseline.alphaBounds.minY) &&
      Number.isInteger(baseline.alphaBounds.maxXInclusive) &&
      Number.isInteger(baseline.alphaBounds.maxYInclusive) &&
      baseline.alphaBounds.minX >= 0 &&
      baseline.alphaBounds.minY >= 0 &&
      baseline.alphaBounds.maxXInclusive >= baseline.alphaBounds.minX &&
      baseline.alphaBounds.maxYInclusive >= baseline.alphaBounds.minY &&
      baseline.alphaBounds.maxXInclusive < baseline.width &&
      baseline.alphaBounds.maxYInclusive < baseline.height &&
      Number.isInteger(baseline.transparentPixelCount) &&
      baseline.transparentPixelCount > 0 &&
      Number.isInteger(baseline.partialAlphaPixelCount) &&
      baseline.partialAlphaPixelCount >= 0
  )
}

function hasPassingTechnicalEvidence(
  evidence: RoomV3FurnitureTechnicalEvidence | undefined
): boolean {
  return Boolean(
    evidence &&
      hasEvidenceId(evidence.alphaAuditId) &&
      evidence.hasCleanAlpha &&
      evidence.hasNoHalo &&
      evidence.hasTransparentCorners &&
      evidence.hasNoBakedBackground &&
      evidence.hasTightBounds &&
      evidence.hasSharedFloorContact
  )
}

function universalTechnicalEvidence(
  alphaAuditId: string
): RoomV3FurnitureTechnicalEvidence {
  return {
    alphaAuditId,
    hasCleanAlpha: true,
    hasNoHalo: true,
    hasTransparentCorners: true,
    hasNoBakedBackground: true,
    hasTightBounds: true,
    hasSharedFloorContact: true
  }
}

function universalArtEvidence(visualReviewId: string): RoomV3FurnitureArtEvidence {
  return {
    visualReviewId,
    matchesBlumiPainterlyStyle: true,
    hasStrongMobileSilhouette: true,
    directionsAreGenuine: true,
    visibleMaterialFamilies: [
      "pale ash or pale oak",
      "cloud-white upholstery or ivory ceramic",
      "soft charcoal detail",
      "restrained soft brass"
    ]
  }
}

function matchesCollectionMaterials(
  evidence: RoomV3FurnitureArtEvidence | undefined,
  collection: RoomV3HomeCollectionPlan
): boolean {
  return matchesRequiredMaterials(
    evidence,
    collection.furnitureCompatibility.requiredMaterialFamilies
  )
}

function matchesRequiredMaterials(
  evidence: RoomV3FurnitureArtEvidence | undefined,
  requiredMaterialFamilies: readonly string[]
): boolean {
  if (!evidence || !hasEvidenceId(evidence.visualReviewId)) return false

  return requiredMaterialFamilies.every((requiredMaterial) =>
    evidence.visibleMaterialFamilies.includes(requiredMaterial)
  )
}

function hasEvidenceId(value: string | undefined): boolean {
  return Boolean(value?.trim())
}
