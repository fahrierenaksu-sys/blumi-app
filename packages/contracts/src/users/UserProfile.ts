import type { AvatarSelection } from "../avatar/AvatarSelection";
import type { DiscoveryPreferences } from "../discovery/DiscoveryFilters";

export const PROFILE_GENDERS = ["woman", "man"] as const;
export const LEGACY_PROFILE_GENDERS = ["non-binary"] as const;

export type ProfileGender = (typeof PROFILE_GENDERS)[number];
export type LegacyProfileGender = (typeof LEGACY_PROFILE_GENDERS)[number];
export type ReadableProfileGender = ProfileGender | LegacyProfileGender;

export function isProfileGender(value: unknown): value is ProfileGender {
  return typeof value === "string" && (PROFILE_GENDERS as readonly string[]).includes(value);
}

export function isReadableProfileGender(
  value: unknown
): value is ReadableProfileGender {
  return isProfileGender(value) ||
    (typeof value === "string" &&
      (LEGACY_PROFILE_GENDERS as readonly string[]).includes(value));
}

export const USER_PROFILE_MAX_INTERESTS = 10;
export const USER_PROFILE_MAX_INTEREST_LENGTH = 30;
export const USER_PROFILE_MAX_PROMPTS = 2;
export const USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH = 120;

export const USER_PROFILE_PROMPT_OPTIONS = [
  { promptId: "small_joy", question: "A small thing that always makes me smile..." },
  { promptId: "ask_me_about", question: "Ask me about..." },
  { promptId: "ideal_sunday", question: "My ideal Sunday looks like..." },
  { promptId: "currently_learning", question: "Something I’m learning right now..." },
  { promptId: "perfect_first_meet", question: "A great first meet includes..." }
] as const;

export type UserProfilePromptId =
  (typeof USER_PROFILE_PROMPT_OPTIONS)[number]["promptId"];

export interface UserProfilePrompt {
  promptId: UserProfilePromptId;
  answer: string;
}

export function normalizeUserProfilePrompts(
  value: unknown
): UserProfilePrompt[] | undefined {
  const decoded = typeof value === "string" ? parsePromptJson(value) : value;
  if (!Array.isArray(decoded)) return undefined;
  const allowedIds = new Set<string>(
    USER_PROFILE_PROMPT_OPTIONS.map((option) => option.promptId)
  );
  const seenIds = new Set<string>();
  const prompts: UserProfilePrompt[] = [];
  for (const candidate of decoded) {
    if (prompts.length >= USER_PROFILE_MAX_PROMPTS) break;
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.promptId !== "string" ||
      !allowedIds.has(record.promptId) ||
      seenIds.has(record.promptId) ||
      typeof record.answer !== "string"
    ) continue;
    const answer = record.answer.trim().replace(/\s+/g, " ");
    if (!answer || answer.length > USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH) {
      continue;
    }
    seenIds.add(record.promptId);
    prompts.push({
      promptId: record.promptId as UserProfilePromptId,
      answer
    });
  }
  return prompts.length > 0 ? prompts : undefined;
}

function parsePromptJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export interface UserProfile {
  userId: string;
  displayName: string;
  avatar: AvatarSelection;
  age?: number;
  bio?: string;
  /** Existing accounts may still read the former non-binary value. */
  gender?: ReadableProfileGender;
  /** Canonical self-described identity. Kept separate from avatar.bodyId. */
  identityGender?: ProfileGender;
  /** Server-backed matching preferences. */
  discoveryPreferences?: DiscoveryPreferences;
  interests?: string[];
  prompts?: UserProfilePrompt[];
  location?: {
    lat: number;
    lng: number;
  };
}
