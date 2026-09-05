import { createHash } from "node:crypto"
import {
  CAPABILITY_KEYS,
  capabilityKeySchema,
  type CapabilityKey,
  type CapabilityMap,
  type CapabilityResolution
} from "@blumi/contracts"
import { z } from "zod"

export const CAPABILITY_ROLLOUT_STAGES = ["internal", 5, 25, 100] as const
export type CapabilityRolloutStage = (typeof CAPABILITY_ROLLOUT_STAGES)[number]

export interface CapabilityManifest {
  readonly rollouts: Readonly<Partial<Record<CapabilityKey, CapabilityRolloutStage>>>
  readonly internalUserIds: readonly string[]
}

export interface ParsedCapabilityManifest {
  readonly valid: boolean
  readonly manifest: CapabilityManifest
}

export interface CapabilityService {
  resolve(
    userId: string,
    declaredCapabilities: readonly CapabilityKey[] | undefined
  ): CapabilityResolution
}

const rolloutStageSchema = z.union([
  z.literal("internal"),
  z.literal(5),
  z.literal(25),
  z.literal(100)
])

const manifestSchema = z.object({
  rollouts: z.record(capabilityKeySchema, rolloutStageSchema),
  internalUserIds: z.array(z.string().trim().min(1)).optional()
}).strict()

const EMPTY_MANIFEST: CapabilityManifest = Object.freeze({
  rollouts: Object.freeze({}),
  internalUserIds: Object.freeze([])
})

export const CAPABILITY_PREREQUISITES: Readonly<
  Partial<Record<CapabilityKey, readonly CapabilityKey[]>>
> = Object.freeze({
  avatar_loadout_v2_write: Object.freeze<CapabilityKey[]>([
    "db_avatar_loadout_v2_ready",
    "avatar_loadout_v2_read"
  ]),
  avatar_dress_outerwear_render: Object.freeze<CapabilityKey[]>([
    "db_avatar_loadout_v2_ready",
    "avatar_loadout_v2_read"
  ]),
  shop_multi_item_apply: Object.freeze<CapabilityKey[]>([
    "avatar_loadout_v2_write"
  ]),
  discovery_public_profile: Object.freeze<CapabilityKey[]>([
    "db_public_card_ready"
  ]),
  discovery_badges: Object.freeze<CapabilityKey[]>([
    "discovery_public_profile"
  ]),
  discovery_room_showcase: Object.freeze<CapabilityKey[]>([
    "db_room_snapshot_ready",
    "discovery_public_profile"
  ]),
  card_studio: Object.freeze<CapabilityKey[]>([
    "discovery_public_profile",
    "discovery_badges",
    "discovery_room_showcase"
  ]),
  card_theme_economy: Object.freeze<CapabilityKey[]>([
    "card_studio"
  ]),
  chat_presence: Object.freeze<CapabilityKey[]>([
    "db_chat_metadata_ready"
  ]),
  chat_read_receipts: Object.freeze<CapabilityKey[]>([
    "db_chat_metadata_ready"
  ]),
  chat_message_edit: Object.freeze<CapabilityKey[]>([
    "db_chat_metadata_ready"
  ])
})

export function parseCapabilityManifest(
  source: string | undefined
): ParsedCapabilityManifest {
  if (!source) return Object.freeze({ valid: false, manifest: EMPTY_MANIFEST })
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(source) as unknown)
    if (!parsed.success) {
      return Object.freeze({ valid: false, manifest: EMPTY_MANIFEST })
    }
    const manifest: CapabilityManifest = Object.freeze({
      rollouts: Object.freeze({ ...parsed.data.rollouts }),
      internalUserIds: Object.freeze([...(parsed.data.internalUserIds ?? [])])
    })
    return Object.freeze({ valid: true, manifest })
  } catch {
    return Object.freeze({ valid: false, manifest: EMPTY_MANIFEST })
  }
}

export function stableCapabilityBucket(userId: string): number {
  const digest = createHash("sha256").update(userId, "utf8").digest()
  return digest.readUInt32BE(0) % 100
}

export function createCapabilityService({
  manifest
}: {
  manifest: CapabilityManifest
}): CapabilityService {
  return Object.freeze({
    resolve(
      userId: string,
      declaredCapabilities: readonly CapabilityKey[] | undefined
    ) {
      if (declaredCapabilities === undefined) {
        return createResolution(true, new Set<CapabilityKey>(), manifest, userId)
      }
      return createResolution(
        false,
        new Set(declaredCapabilities),
        manifest,
        userId
      )
    }
  })
}

function createResolution(
  legacy: boolean,
  declared: ReadonlySet<CapabilityKey>,
  manifest: CapabilityManifest,
  userId: string
): CapabilityResolution {
  const bucket = stableCapabilityBucket(userId)
  const base = Object.fromEntries(CAPABILITY_KEYS.map((key) => [
    key,
    !legacy && (isServerOnlyCapability(key) || declared.has(key)) && isInRollout(
      manifest.rollouts[key],
      bucket,
      manifest.internalUserIds.includes(userId)
    )
  ])) as Record<CapabilityKey, boolean>

  const resolved = Object.fromEntries(CAPABILITY_KEYS.map((key) => [
    key,
    resolvePrerequisites(key, base, new Set<CapabilityKey>())
  ])) as Record<CapabilityKey, boolean>

  return Object.freeze({
    legacy,
    capabilities: Object.freeze(resolved) as CapabilityMap
  })
}

function isServerOnlyCapability(key: CapabilityKey): boolean {
  return key.startsWith("db_")
}

function resolvePrerequisites(
  key: CapabilityKey,
  base: Readonly<Record<CapabilityKey, boolean>>,
  visited: ReadonlySet<CapabilityKey>
): boolean {
  if (!base[key] || visited.has(key)) return false
  const nextVisited = new Set(visited)
  nextVisited.add(key)
  return (CAPABILITY_PREREQUISITES[key] ?? []).every((prerequisite) =>
    resolvePrerequisites(prerequisite, base, nextVisited)
  )
}

function isInRollout(
  stage: CapabilityRolloutStage | undefined,
  bucket: number,
  internalUser: boolean
): boolean {
  if (stage === "internal") return internalUser
  return stage !== undefined && bucket < stage
}
