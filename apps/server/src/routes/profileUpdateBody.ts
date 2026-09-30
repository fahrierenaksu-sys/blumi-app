import type { DiscoveryPreferences, UserProfilePrompt } from "@blumi/contracts"
import type { ProfileUpdateInput } from "../auth/authService"
import { PublicRequestError } from "../errors/publicRequestError"

/**
 * Reads the PATCH /v1/users/me body. A known field that is present with the
 * wrong type makes the whole update invalid (400, nothing written) instead of
 * being dropped silently. `null` and absent both mean "not provided", as
 * before; unknown keys are ignored. `prompts` keeps its stricter rule: when
 * present it must be a list of `{ promptId, answer }` strings.
 */
export function readProfileUpdateBody(
  body: Record<string, unknown>
): ProfileUpdateInput | null {
  const input: ProfileUpdateInput = {}
  for (const key of ["displayName", "avatarPresetId", "bio", "gender", "identityGender"] as const) {
    const value = body[key]
    if (value === undefined || value === null) continue
    if (typeof value !== "string") return null
    input[key] = value
  }
  if (body.age !== undefined && body.age !== null) {
    if (typeof body.age !== "number") return null
    input.age = body.age
  }
  const preferences = body.discoveryPreferences
  if (preferences !== undefined && preferences !== null) {
    if (typeof preferences !== "object" || Array.isArray(preferences)) return null
    input.discoveryPreferences = preferences as DiscoveryPreferences
  }
  if (body.interests !== undefined && body.interests !== null) {
    if (!Array.isArray(body.interests) || !body.interests.every((interest) => typeof interest === "string")) {
      return null
    }
    input.interests = body.interests
  }
  const prompts = readProfilePrompts(body)
  if (prompts) input.prompts = prompts
  return input
}

function readProfilePrompts(
  body: Record<string, unknown>
): UserProfilePrompt[] | undefined {
  if (!Object.hasOwn(body, "prompts")) return undefined
  if (!Array.isArray(body.prompts)) {
    throw new PublicRequestError("Profile prompts must be a list.")
  }
  return body.prompts.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new PublicRequestError("Choose a valid profile prompt.")
    }
    const prompt = candidate as Record<string, unknown>
    if (
      typeof prompt.promptId !== "string" ||
      typeof prompt.answer !== "string"
    ) {
      throw new PublicRequestError("Choose a valid profile prompt.")
    }
    return {
      promptId: prompt.promptId,
      answer: prompt.answer
    } as UserProfilePrompt
  })
}
