import assert from "node:assert/strict"
import test from "node:test"
import {
  createAvatarSelection,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import {
  createAccountRecord,
  createDefaultAvatarSelection,
  isProductEligibleAccount
} from "./authStore"

test("default avatar selections use the shared body-specific starter loadouts", () => {
  assert.deepEqual(
    createDefaultAvatarSelection("avatar_v2_body_male_light", 4),
    createAvatarSelection(DEFAULT_MALE_AVATAR_LOADOUT, 4)
  )
  assert.deepEqual(
    createDefaultAvatarSelection("avatar_v2_body_default", 2),
    createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 2)
  )
})

test("product eligibility requires a server-approved gender", () => {
  const account = createAccountRecord("+905551112233")
  const completed = {
    ...account,
    profile: {
      ...account.profile,
      displayName: "Mina",
      age: 24
    },
    onboarding: {
      profile: "complete" as const,
      avatar: "complete" as const,
      room: "complete" as const
    }
  }

  assert.equal(isProductEligibleAccount(completed), false)
  assert.equal(
    isProductEligibleAccount({
      ...completed,
      profile: { ...completed.profile, gender: "woman" }
    }),
    true
  )

  assert.equal(
    isProductEligibleAccount({
      ...completed,
      profile: { ...completed.profile, gender: "non-binary" }
    }),
    true
  )

  assert.equal(
    isProductEligibleAccount({
      ...completed,
      profile: {
        ...completed.profile,
        gender: undefined,
        identityGender: "man"
      }
    }),
    true
  )
})
