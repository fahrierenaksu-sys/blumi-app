import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

export const resolvePromotionRoots = () => {
  const repositoryRoot = resolve(scriptDirectory, "../../..")
  const roomRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")

  return {
    repositoryRoot,
    roomRoot,
    motionRoot: join(roomRoot, "motion"),
    wave2Root: join(repositoryRoot, "docs/avatar-motion-pipeline/male-wave2-static-qa"),
    hairRoot: join(repositoryRoot, "docs/avatar-motion-pipeline/male-hair-shoes-wave3-qa"),
    motionStagingRoot: join(
      repositoryRoot,
      "docs/avatar-motion-pipeline/male-motion-wave-staging/frames"
    ),
    shoeMotionRoot: join(
      repositoryRoot,
      "docs/avatar-motion-pipeline/male-shoes-wave3-motion-staging"
    )
  }
}

const {
  roomRoot,
  motionRoot,
  wave2Root,
  hairRoot,
  motionStagingRoot,
  shoeMotionRoot
} = resolvePromotionRoots()

const staticPromotions = [
  [wave2Root, "avatar_room_top_male_mist_blue_oxford_shirt_v1_alpha.png", "avatar_room_top_male_mist_blue_oxford_shirt_v1.png"],
  [wave2Root, "avatar_room_top_male_soft_sage_linen_shirt_v1_alpha.png", "avatar_room_top_male_soft_sage_linen_shirt_v1.png"],
  [wave2Root, "avatar_room_top_male_cocoa_varsity_jacket_v1_alpha.png", "avatar_room_top_male_cocoa_varsity_jacket_v1.png"],
  [wave2Root, "avatar_room_top_male_dusty_navy_chore_jacket_v1_alpha.png", "avatar_room_top_male_dusty_navy_chore_jacket_v1.png"],
  [wave2Root, "avatar_room_bottom_male_mid_blue_straight_jeans_v1_alpha.png", "avatar_room_bottom_male_mid_blue_straight_jeans_v1.png"],
  [wave2Root, "avatar_room_bottom_male_charcoal_tapered_chinos_v1_alpha.png", "avatar_room_bottom_male_charcoal_tapered_chinos_v1.png"],
  [wave2Root, "avatar_room_bottom_male_warm_sand_relaxed_pants_v1_alpha.png", "avatar_room_bottom_male_warm_sand_relaxed_pants_v1.png"],
  [hairRoot, "avatar_room_hair_front_male_cocoa_textured_quiff_v1_alpha.png", "avatar_room_hair_front_male_cocoa_textured_quiff_v1.png"],
  [hairRoot, "avatar_room_hair_front_male_soft_black_side_part_v1_alpha.png", "avatar_room_hair_front_male_soft_black_side_part_v1.png"],
  [hairRoot, "avatar_room_hair_front_male_chestnut_short_waves_v1_alpha.png", "avatar_room_hair_front_male_chestnut_short_waves_v1.png"],
  [hairRoot, "avatar_room_shoes_male_milk_tea_court_v1_repaired_alpha.png", "avatar_room_shoes_male_milk_tea_court_v1.png"],
  [hairRoot, "avatar_room_shoes_male_cloud_white_trainers_v1_alpha.png", "avatar_room_shoes_male_cloud_white_trainers_v1.png"],
  [hairRoot, "avatar_room_shoes_male_cocoa_penny_loafers_v1_alpha.png", "avatar_room_shoes_male_cocoa_penny_loafers_v1.png"],
  [hairRoot, "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1_alpha.png", "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1.png"]
]

const animatedItems = [
  ["top", "cream_basic_tee"],
  ["top", "dusty_navy_tee"],
  ["top", "powder_blue_crew_tee"],
  ["top", "sage_basic_tee"],
  ["top", "mist_blue_oxford_shirt"],
  ["top", "soft_sage_linen_shirt"],
  ["top", "cocoa_varsity_jacket"],
  ["top", "dusty_navy_chore_jacket"],
  ["bottom", "navy_straight_pants"],
  ["bottom", "mid_blue_straight_jeans"],
  ["bottom", "charcoal_tapered_chinos"],
  ["bottom", "warm_sand_relaxed_pants"]
]

const motionNames = animatedItems.flatMap(([kind, slug]) => [
  ...[1, 2, 3, 4].map((frame) =>
    `room_avatar_${kind}_male_${slug}_v1_walking_front_f${String(frame).padStart(2, "0")}.png`
  ),
  `room_avatar_${kind}_male_${slug}_v1_sitting_front_f01.png`
])
const shoeMotionNames = [
  "cloud_white_trainers",
  "cocoa_penny_loafers",
  "dusty_blue_canvas_sneakers"
].flatMap((slug) => [
  ...[1, 2, 3, 4].map((frame) =>
    `room_avatar_shoes_male_${slug}_v1_walking_front_f${String(frame).padStart(2, "0")}.png`
  ),
  `room_avatar_shoes_male_${slug}_v1_sitting_front_f01.png`
])

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const preflightPromotionPlan = (plan) => {
  const destinations = new Set()

  return plan.map((entry) => {
    const destination = resolve(entry.destination)

    if (!existsSync(entry.source)) {
      throw new Error(`promotion source is missing: ${entry.label ?? entry.source}`)
    }

    const sourceStat = statSync(entry.source)
    if (!sourceStat.isFile() || sourceStat.size === 0) {
      throw new Error(`promotion source is invalid: ${entry.label ?? entry.source}`)
    }
    if (destinations.has(destination)) {
      throw new Error(`duplicate promotion destination: ${destination}`)
    }
    destinations.add(destination)

    return {
      ...entry,
      destination,
      sourceHash: sha256(entry.source)
    }
  })
}

export const promoteAssets = (plan) => {
  const approvedPlan = preflightPromotionPlan(plan)
  let promoted = 0
  let unchanged = 0

  for (const entry of approvedPlan) {
    if (existsSync(entry.destination) && sha256(entry.destination) === entry.sourceHash) {
      unchanged += 1
      continue
    }

    mkdirSync(dirname(entry.destination), { recursive: true })
    const stagedDestination = join(
      dirname(entry.destination),
      `.${basename(entry.destination)}.${process.pid}.${randomUUID()}.tmp`
    )

    try {
      copyFileSync(entry.source, stagedDestination)
      if (sha256(stagedDestination) !== entry.sourceHash) {
        throw new Error(`promotion staging mismatch: ${entry.label ?? entry.destination}`)
      }
      renameSync(stagedDestination, entry.destination)
      promoted += 1
    } finally {
      rmSync(stagedDestination, { force: true })
    }
  }

  return { promoted, unchanged }
}

const createPromotionPlan = () => [
  ...staticPromotions.map(([sourceRoot, sourceName, destinationName]) => ({
    source: join(sourceRoot, sourceName),
    destination: join(roomRoot, destinationName),
    label: `static ${destinationName}`
  })),
  ...motionNames.map((name) => ({
    source: join(motionStagingRoot, name),
    destination: join(motionRoot, name),
    label: `motion ${name}`
  })),
  ...shoeMotionNames.map((name) => ({
    source: join(shoeMotionRoot, name),
    destination: join(motionRoot, name),
    label: `shoe motion ${name}`
  }))
]

const isMainModule = process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  const result = promoteAssets(createPromotionPlan())
  console.log(
    `promoted ${result.promoted}; ${result.unchanged} already current ` +
    `(${staticPromotions.length} static, ${motionNames.length + shoeMotionNames.length} motion)`
  )
  console.log(`static target: ${basename(roomRoot)}; motion target: ${basename(motionRoot)}`)
}
