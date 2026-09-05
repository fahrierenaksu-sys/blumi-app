import type {
  DiscoveryFilters,
  DiscoveryGender
} from "@blumi/contracts"
import { DISCOVERY_GENDERS } from "@blumi/contracts"

export const DISCOVERY_MINIMUM_AGE = 18
export const DISCOVERY_MAXIMUM_AGE = 99
const MAXIMUM_VIBES = 8
const ALLOWED_GENDERS = new Set<DiscoveryGender>(DISCOVERY_GENDERS)

export const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  ageMin: DISCOVERY_MINIMUM_AGE,
  ageMax: DISCOVERY_MAXIMUM_AGE,
  genders: [],
  vibes: []
}

export interface DiscoveryFiltersStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export interface DiscoveryFiltersFallbackStorage extends DiscoveryFiltersStorage {
  removeItem(key: string): Promise<void>
}

const GENDER_LABELS: Record<DiscoveryGender, string> = {
  woman: "Women",
  man: "Men"
}

export function normalizeDiscoveryFilters(value: unknown): DiscoveryFilters {
  if (!value || typeof value !== "object") {
    return copyDefaultDiscoveryFilters()
  }

  const record = value as Record<string, unknown>
  const ageMin = normalizeAge(record.ageMin, DISCOVERY_MINIMUM_AGE)
  const ageMax = normalizeAge(record.ageMax, DISCOVERY_MAXIMUM_AGE)
  const normalizedMin = Math.min(ageMin, ageMax)
  const normalizedMax = Math.max(ageMin, ageMax)

  return {
    ageMin: normalizedMin,
    ageMax: normalizedMax,
    genders: normalizeGenders(record.genders),
    vibes: normalizeVibes(record.vibes)
  }
}

export function getDiscoveryFiltersStorageKey(userId: string): string {
  return `@blumi/discover_filters/${encodeURIComponent(userId.trim())}`
}

export function getLocalDiscoveryFiltersFallbackStorageKey(userId: string): string {
  return `@blumi/discover_filters_pending_sync/${encodeURIComponent(userId.trim())}`
}

export function formatDiscoveryFiltersSummary(filters: DiscoveryFilters): string {
  const normalized = normalizeDiscoveryFilters(filters)
  const audience = normalized.genders.length === 0
    ? "Everyone"
    : normalized.genders.map((gender) => GENDER_LABELS[gender]).join(" + ")
  return `${audience} · Ages ${normalized.ageMin}–${normalized.ageMax}`
}

export async function loadDiscoveryFilters(
  storage: DiscoveryFiltersStorage,
  userId: string
): Promise<DiscoveryFilters> {
  try {
    const raw = await storage.getItem(getDiscoveryFiltersStorageKey(userId))
    if (!raw) return copyDefaultDiscoveryFilters()
    return normalizeDiscoveryFilters(JSON.parse(raw) as unknown)
  } catch {
    return copyDefaultDiscoveryFilters()
  }
}

export async function persistDiscoveryFilters(
  storage: DiscoveryFiltersStorage,
  userId: string,
  filters: DiscoveryFilters
): Promise<DiscoveryFilters> {
  const normalized = normalizeDiscoveryFilters(filters)
  await storage.setItem(
    getDiscoveryFiltersStorageKey(userId),
    JSON.stringify(normalized)
  )
  return normalized
}

export async function loadLocalDiscoveryFiltersFallback(
  storage: DiscoveryFiltersStorage,
  userId: string
): Promise<DiscoveryFilters | null> {
  try {
    const raw = await storage.getItem(
      getLocalDiscoveryFiltersFallbackStorageKey(userId)
    )
    if (!raw) return null
    return normalizeDiscoveryFilters(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export async function persistLocalDiscoveryFiltersFallback(
  storage: DiscoveryFiltersStorage,
  userId: string,
  filters: DiscoveryFilters
): Promise<DiscoveryFilters> {
  const normalized = normalizeDiscoveryFilters(filters)
  await storage.setItem(
    getLocalDiscoveryFiltersFallbackStorageKey(userId),
    JSON.stringify(normalized)
  )
  return normalized
}

export async function clearLocalDiscoveryFiltersFallback(
  storage: DiscoveryFiltersFallbackStorage,
  userId: string
): Promise<void> {
  await storage.removeItem(getLocalDiscoveryFiltersFallbackStorageKey(userId))
}

export function resolveDiscoveryFiltersForFocus(
  accountFilters: DiscoveryFilters | null | undefined,
  localFallback: DiscoveryFilters | null
): DiscoveryFilters {
  return normalizeDiscoveryFilters(
    localFallback ?? accountFilters ?? DEFAULT_DISCOVERY_FILTERS
  )
}

function copyDefaultDiscoveryFilters(): DiscoveryFilters {
  return {
    ...DEFAULT_DISCOVERY_FILTERS,
    genders: [],
    vibes: []
  }
}

function normalizeAge(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(
    DISCOVERY_MINIMUM_AGE,
    Math.min(DISCOVERY_MAXIMUM_AGE, Math.floor(value))
  )
}

function normalizeGenders(value: unknown): DiscoveryGender[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value)
    .map((gender) => gender.toLowerCase())
    .filter((gender): gender is DiscoveryGender =>
      ALLOWED_GENDERS.has(gender as DiscoveryGender)
    )
}

function normalizeVibes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value)
    .filter((vibe) => vibe.length <= 40)
    .slice(0, MAXIMUM_VIBES)
}

function uniqueStrings(value: unknown[]): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const normalized = item.trim().replace(/\s+/g, " ")
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    values.push(normalized)
  }
  return values
}
