import {
  USER_PROFILE_MAX_PROMPTS,
  USER_PROFILE_PROMPT_OPTIONS,
  type UserProfilePrompt,
  type UserProfilePromptId
} from "@blumi/contracts"
import type { DiscoveryDecisionCapability } from "../discovery/discoveryCandidateModel"
import type { AppLocale } from "../session/appLocale"

/**
 * Pure presentation rules for the own profile page and the profile preview.
 * Screens render what this returns; nothing here touches React or the network.
 */

export interface ProfileSourceFields {
  bio?: string
  interests?: readonly string[]
  prompts?: readonly UserProfilePrompt[]
}

export interface ProfilePromptView {
  id: UserProfilePromptId
  question: string
  answer: string
}

export type ProfileCompletionStep = "bio" | "interests" | "prompt"

export interface ProfileCompleteness {
  /** Filled steps out of `total` (the character is always step one). */
  done: number
  total: number
  percent: number
  complete: boolean
  /** The first empty step, in the order a new user is invited to fill them. */
  nextStep: ProfileCompletionStep | null
}

export interface OwnProfileSections {
  bio: string | null
  interests: readonly string[]
  prompts: readonly ProfilePromptView[]
  /** An "add" affordance shows for every empty section, never a blank card. */
  showAddBio: boolean
  showAddInterests: boolean
  showAddPrompt: boolean
  completeness: ProfileCompleteness
}

const PROMPT_QUESTIONS_TR: Record<UserProfilePromptId, string> = {
  small_joy: "Beni hep gülümseten küçük bir şey...",
  ask_me_about: "Bana şunu sor...",
  ideal_sunday: "İdeal pazar günüm...",
  currently_learning: "Şu sıralar öğrendiğim bir şey...",
  perfect_first_meet: "Güzel bir ilk buluşmada..."
}

export function getProfilePromptQuestion(
  promptId: UserProfilePromptId,
  locale: AppLocale
): string | null {
  const option = USER_PROFILE_PROMPT_OPTIONS.find((candidate) => candidate.promptId === promptId)
  if (!option) return null
  return locale === "tr" ? PROMPT_QUESTIONS_TR[promptId] : option.question
}

export function toProfilePromptViews(
  prompts: readonly UserProfilePrompt[] | undefined,
  locale: AppLocale
): ProfilePromptView[] {
  return (prompts ?? []).flatMap((prompt) => {
    const answer = prompt.answer.trim()
    const question = getProfilePromptQuestion(prompt.promptId, locale)
    return question && answer ? [{ id: prompt.promptId, question, answer }] : []
  }).slice(0, USER_PROFILE_MAX_PROMPTS)
}

function cleanInterests(interests: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of interests ?? []) {
    const interest = raw.trim()
    const key = interest.toLocaleLowerCase()
    if (!interest || seen.has(key)) continue
    seen.add(key)
    result.push(interest)
  }
  return result
}

export function resolveProfileCompleteness(input: {
  hasBio: boolean
  interestCount: number
  promptCount: number
}): ProfileCompleteness {
  // Character (always set after onboarding), bio, interests, and each prompt.
  const total = 3 + USER_PROFILE_MAX_PROMPTS
  const promptDone = Math.min(input.promptCount, USER_PROFILE_MAX_PROMPTS)
  const done = 1 + (input.hasBio ? 1 : 0) + (input.interestCount > 0 ? 1 : 0) + promptDone
  const nextStep: ProfileCompletionStep | null = !input.hasBio
    ? "bio"
    : input.interestCount === 0
      ? "interests"
      : promptDone < USER_PROFILE_MAX_PROMPTS
        ? "prompt"
        : null
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    complete: nextStep === null,
    nextStep
  }
}

export function resolveOwnProfileSections(
  profile: ProfileSourceFields,
  locale: AppLocale
): OwnProfileSections {
  const bio = profile.bio?.trim() ? profile.bio.trim() : null
  const interests = cleanInterests(profile.interests)
  const prompts = toProfilePromptViews(profile.prompts, locale)
  return {
    bio,
    interests,
    prompts,
    showAddBio: bio === null,
    showAddInterests: interests.length === 0,
    showAddPrompt: prompts.length < USER_PROFILE_MAX_PROMPTS,
    completeness: resolveProfileCompleteness({
      hasBio: bio !== null,
      interestCount: interests.length,
      promptCount: prompts.length
    })
  }
}

/* ── Profile preview context ───────────────────────────────────────── */

export const PROFILE_PREVIEW_CONTEXTS = ["discover", "matched", "self"] as const
export type ProfilePreviewContext = (typeof PROFILE_PREVIEW_CONTEXTS)[number]

export function isProfilePreviewContext(value: unknown): value is ProfilePreviewContext {
  return typeof value === "string" &&
    (PROFILE_PREVIEW_CONTEXTS as readonly string[]).includes(value)
}

/**
 * Who is looking and from where. An explicit route context wins, except that
 * the viewer's own profile is always "self" (it can never be liked or invited).
 * Without one, a profile opened on top of a chat is a match's profile.
 */
export function resolveProfilePreviewContext(input: {
  requested?: unknown
  isSelf: boolean
  previousRouteName?: string
}): ProfilePreviewContext {
  if (input.isSelf) return "self"
  if (input.requested === "discover" || input.requested === "matched") return input.requested
  return input.previousRouteName === "ChatThread" ? "matched" : "discover"
}

export type ProfilePreviewActions =
  | {
      kind: "decide"
      /** Say hi is shown but disabled for view-only or blocked profiles. */
      likeEnabled: boolean
      showViewOnlyNotice: boolean
    }
  | { kind: "matched"; canInvite: boolean }
  | { kind: "none" }

export function resolveProfilePreviewActions(input: {
  context: ProfilePreviewContext
  blocked: boolean
  decisionCapability: DiscoveryDecisionCapability
  serverDeniedDecision?: boolean
  productionDiscovery: boolean
}): ProfilePreviewActions {
  if (input.context === "self") return { kind: "none" }
  if (input.context === "matched") return { kind: "matched", canInvite: !input.blocked }
  const likeEnabled = !input.blocked &&
    input.decisionCapability !== "unavailable" &&
    input.decisionCapability !== "view-only" &&
    input.serverDeniedDecision !== true
  return {
    kind: "decide",
    likeEnabled,
    showViewOnlyNotice: input.productionDiscovery && !likeEnabled
  }
}

/** Safety (report/block) is offered for anyone but yourself. */
export function shouldShowProfileSafety(context: ProfilePreviewContext): boolean {
  return context !== "self"
}

/**
 * The preview's tag row. Tags are rendered once; the former vibe line repeated
 * the same tags as text and is gone.
 */
export function resolvePreviewTags(tags: readonly string[]): string[] {
  return cleanInterests(tags)
}

/* ── Matched context: back to chat / invite to room ────────────────── */

export interface ProfileChatRouteLike {
  name: string
  params?: object
}

export interface ProfileChatParams {
  threadId?: string
  partnerId?: string
  partnerName?: string
  roomInviteRequest?: string
}

export type ProfileChatNavigation =
  | { kind: "back" }
  | { kind: "popTo"; params: ProfileChatParams }
  | { kind: "navigate"; params: ProfileChatParams }

/**
 * Where "Back to chat" and "Invite to room" lead from a match's profile. When
 * the chat sits right below, it is reused (the invite is sent by the chat's
 * own invite action, so its busy state, errors and "close your previous room"
 * recovery stay in one place); otherwise the chat opens for this partner.
 */
export function resolveMatchedChatNavigation(input: {
  previousRoute: ProfileChatRouteLike | undefined
  partner: { userId: string; displayName: string }
  inviteRequest?: string
}): ProfileChatNavigation {
  const previous = input.previousRoute
  const chatBelow = previous?.name === "ChatThread"
  if (!input.inviteRequest) {
    return chatBelow
      ? { kind: "back" }
      : { kind: "navigate", params: { partnerId: input.partner.userId, partnerName: input.partner.displayName } }
  }
  if (previous && chatBelow) {
    const params = (previous.params ?? {}) as ProfileChatParams
    return { kind: "popTo", params: { ...params, roomInviteRequest: input.inviteRequest } }
  }
  return {
    kind: "navigate",
    params: {
      partnerId: input.partner.userId,
      partnerName: input.partner.displayName,
      roomInviteRequest: input.inviteRequest
    }
  }
}
