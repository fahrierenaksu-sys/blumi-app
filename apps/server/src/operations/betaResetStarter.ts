import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  STARTER_COIN_BALANCE,
  STARTER_ROOM_BED_ID,
  isRetiredAvatarItemId
} from "@blumi/domain"

/**
 * What the beta reset gives every account, read from the release code that runs it. Its digest is part of the
 * dry-run hash, so an apply from a checkout with different starters (another branch, a stale build) is refused.
 */
export interface BetaResetStarter {
  readonly femaleLoadout: typeof DEFAULT_FEMALE_AVATAR_LOADOUT
  readonly maleLoadout: typeof DEFAULT_MALE_AVATAR_LOADOUT
  readonly roomDecor: Readonly<Record<string, unknown>>
  readonly coins: number
  readonly digest: string
}

/** The starter room: the production shell with only the free starter bed at its default point (mobile `roomStarterModel.ts`). */
export const BETA_RESET_STARTER_ROOM_DECOR = Object.freeze({
  schemaVersion: 3,
  geometryVersion: "room_v2",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{ instanceId: "starter-room-bed", itemId: STARTER_ROOM_BED_ID, x: 0.52, y: 0.7, rotation: "front" }]
})

interface StarterSource {
  readonly DEFAULT_FEMALE_AVATAR_LOADOUT: unknown
  readonly DEFAULT_MALE_AVATAR_LOADOUT: unknown
  readonly STARTER_COIN_BALANCE: unknown
  readonly STARTER_ROOM_BED_ID: unknown
}

/** The starters as the running server sees them (`@blumi/domain` resolves to its built `dist/`). */
export function readBetaResetStarter(): BetaResetStarter {
  const content = {
    femaleLoadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
    maleLoadout: DEFAULT_MALE_AVATAR_LOADOUT,
    roomDecor: BETA_RESET_STARTER_ROOM_DECOR,
    coins: STARTER_COIN_BALANCE
  }
  const retired = [content.femaleLoadout, content.maleLoadout]
    .flatMap((loadout) => Object.values(loadout).flat())
    .filter((value): value is string => typeof value === "string" && isRetiredAvatarItemId(value))
  if (retired.length > 0) throw new Error(`${retired.length} starter items are retired in this checkout; reset refused.`)
  return { ...content, digest: sha256(canonicalJson(content)).slice(0, 16) }
}

/**
 * Refuses when the built `@blumi/domain` differs from this checkout's source, so a stale `dist/` can never hand
 * out the previous release's starters. The fix is `npm run build:packages` in the same checkout.
 */
export async function assertStarterMatchesSource(repositoryRoot: string, starter: BetaResetStarter): Promise<void> {
  const sourceUrl = pathToFileURL(resolve(repositoryRoot, "packages/domain/src/index.ts")).href
  const source = (await import(sourceUrl)) as StarterSource
  const fromSource = canonicalJson([source.DEFAULT_FEMALE_AVATAR_LOADOUT, source.DEFAULT_MALE_AVATAR_LOADOUT,
    source.STARTER_COIN_BALANCE, source.STARTER_ROOM_BED_ID])
  const fromBuild = canonicalJson([starter.femaleLoadout, starter.maleLoadout, starter.coins, STARTER_ROOM_BED_ID])
  if (fromSource !== fromBuild) {
    throw new Error("The built @blumi/domain differs from this checkout; run npm run build:packages first. Reset refused.")
  }
}

/** The item IDs (catalog IDs, never user data) the operator checks against the release before applying. */
export function describeBetaResetStarter(starter: BetaResetStarter): Record<string, unknown> {
  const itemIds = (loadout: Readonly<Record<string, unknown>>) =>
    Object.entries(loadout).filter(([key]) => key.endsWith("Id") || key === "accessoryIds").map(([, value]) => value).flat()
  return {
    digest: starter.digest,
    coins: starter.coins,
    female: itemIds(starter.femaleLoadout),
    male: itemIds(starter.maleLoadout),
    room: [starter.roomDecor.roomShellId, STARTER_ROOM_BED_ID]
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
