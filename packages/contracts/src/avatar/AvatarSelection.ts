export interface AvatarLoadoutV1 {
  schemaVersion: 1;
  bodyId: string;
  faceId: string;
  eyesId: string;
  noseId: string;
  mouthId: string;
  hairId: string;
  topId: string;
  bottomId: string;
  shoesId: string;
  accessoryIds: string[];
}

export interface AvatarLoadoutV2 {
  schemaVersion: 2;
  bodyId: string;
  faceId: string;
  eyesId: string;
  noseId: string;
  mouthId: string;
  hairId: string;
  topId: string;
  bottomId: string;
  shoesId: string;
  dressId: string | null;
  outerwearId: string | null;
  accessoryIds: string[];
}

export type AcceptedAvatarLoadout = AvatarLoadoutV1 | AvatarLoadoutV2;

/** All loadout schema versions accepted at shared system boundaries. */
export type AvatarLoadout = AcceptedAvatarLoadout;

export interface AvatarSelection {
  presetId: string;
  loadout?: AvatarLoadout;
  revision?: number;
}

export interface CompleteAvatarSelection extends AvatarSelection {
  loadout: AvatarLoadout;
  revision: number;
}

const MAX_ITEM_ID_LENGTH = 120;
const COMMON_LOADOUT_KEYS = [
  "schemaVersion",
  "bodyId",
  "faceId",
  "eyesId",
  "noseId",
  "mouthId",
  "hairId",
  "topId",
  "bottomId",
  "shoesId",
  "accessoryIds",
] as const;
const V2_LOADOUT_KEYS = [
  ...COMMON_LOADOUT_KEYS,
  "dressId",
  "outerwearId",
] as const;
const ITEM_ID_KEYS = [
  "bodyId",
  "faceId",
  "eyesId",
  "noseId",
  "mouthId",
  "hairId",
  "topId",
  "bottomId",
  "shoesId",
] as const;

export function isAvatarLoadoutV1(input: unknown): input is AvatarLoadoutV1 {
  return hasExactKeys(input, COMMON_LOADOUT_KEYS) &&
    input.schemaVersion === 1 &&
    hasValidCommonFields(input);
}

export function isAvatarLoadoutV2(input: unknown): input is AvatarLoadoutV2 {
  return hasExactKeys(input, V2_LOADOUT_KEYS) &&
    input.schemaVersion === 2 &&
    hasValidCommonFields(input) &&
    isNullableItemId(input.dressId) &&
    isNullableItemId(input.outerwearId);
}

export function isAcceptedAvatarLoadout(
  input: unknown,
): input is AcceptedAvatarLoadout {
  return isAvatarLoadoutV1(input) || isAvatarLoadoutV2(input);
}

function hasValidCommonFields(input: Record<string, unknown>): boolean {
  return ITEM_ID_KEYS.every((key) => isItemId(input[key])) &&
    Array.isArray(input.accessoryIds) &&
    input.accessoryIds.every(isItemId);
}

function hasExactKeys<const Key extends string>(
  input: unknown,
  expectedKeys: readonly Key[],
): input is Record<Key, unknown> {
  if (!isRecord(input)) return false;
  const actualKeys = Object.keys(input);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(input, key));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNullableItemId(input: unknown): input is string | null {
  return input === null || isItemId(input);
}

function isItemId(input: unknown): input is string {
  return typeof input === "string" &&
    input.length > 0 &&
    input.length <= MAX_ITEM_ID_LENGTH &&
    input.trim() === input;
}
