import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { runRepositoryContract } from "../db/repositoryContract"
import { createAdversarialServer } from "./adversarialFixture"

// Control characters in public profile text (display name, bio, prompt
// answers, interests) are refused with 400 through PATCH /v1/users/me, both
// while onboarding and afterwards, on both auth repositories. PostgreSQL
// rejects NUL in text, so an unchecked NUL surfaced as a 500.
const TERMS = { version: "test-terms-v1", locale: "en" as const }
const CONTROL_CHARACTERS = ["\u0000", "\u0007", "\u001b", "\u007f"]

async function withMember(
  repository: AuthRepository,
  run: (input: {
    server: ReturnType<typeof createAdversarialServer>
    token: string
    accountId: string
  }) => Promise<void>
): Promise<void> {
  const authService = createAuthService({ repository })
  const server = createAdversarialServer({ authService })
  try {
    await server.app.ready()
    const phoneNumber = `+1558${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
    const signed = await authService.signInWithVerifiedPhone(phoneNumber, {
      acceptedTerms: TERMS,
      firebaseUid: `uid_control_${phoneNumber.slice(1)}`
    })
    await run({ server, token: signed.sessionToken, accountId: signed.account.accountId })
  } finally {
    await server.app.close()
  }
}

function hostilePayloads(control: string): Array<Record<string, unknown>> {
  return [
    { displayName: `Ay${control}se` },
    { bio: `Coffee${control} walks` },
    { prompts: [{ promptId: "small_joy", answer: `Fresh${control}coffee` }] },
    { interests: ["music", `ja${control}zz`] }
  ]
}

runRepositoryContract<AuthRepository>({
  name: "profile text control characters",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryAuthRepository(createBlumiBackendStore()),
    postgres: (pool) => createPostgresAuthRepository(pool)
  },
  cases: {
    "onboarding profile setup refuses control characters and keeps the account unchanged": async ({ repository }) => {
      await withMember(repository, async ({ server, token, accountId }) => {
        const before = await repository.findAccountById(accountId)
        for (const control of CONTROL_CHARACTERS) {
          for (const payload of hostilePayloads(control)) {
            const response = await server.call("PATCH", "/v1/users/me", {
              token,
              payload: { ...payload, age: 25, gender: "woman" }
            })
            assert.equal(response.statusCode, 400, `${JSON.stringify(payload)} -> ${response.body}`)
          }
        }
        assert.deepEqual(await repository.findAccountById(accountId), before)

        const valid = await server.call("PATCH", "/v1/users/me", {
          token,
          payload: { displayName: "Ayse", age: 25, gender: "woman" }
        })
        assert.equal(valid.statusCode, 200, valid.body)
        const step = await server.call("PATCH", "/v1/users/me/onboarding", { token, payload: { step: "profile" } })
        assert.equal(step.statusCode, 200, step.body)
      })
    },

    "a completed profile refuses control characters in every public text field": async ({ repository }) => {
      await withMember(repository, async ({ server, token, accountId }) => {
        const setup = await server.call("PATCH", "/v1/users/me", {
          token,
          payload: {
            displayName: "Deniz",
            age: 27,
            gender: "man",
            bio: "Slow coffee.",
            interests: ["music"],
            prompts: [{ promptId: "small_joy", answer: "Rainy mornings." }]
          }
        })
        assert.equal(setup.statusCode, 200, setup.body)
        const before = await repository.findAccountById(accountId)
        for (const control of CONTROL_CHARACTERS) {
          for (const payload of hostilePayloads(control)) {
            const response = await server.call("PATCH", "/v1/users/me", { token, payload })
            assert.equal(response.statusCode, 400, `${JSON.stringify(payload)} -> ${response.body}`)
            assert.match(response.json().error, /unsupported characters/i)
          }
        }
        assert.deepEqual(await repository.findAccountById(accountId), before)

        // Ordinary whitespace is still collapsed, not refused.
        const spaced = await server.call("PATCH", "/v1/users/me", {
          token,
          payload: { displayName: "Deniz\tK", bio: "Slow\ncoffee." }
        })
        assert.equal(spaced.statusCode, 200, spaced.body)
        assert.equal(spaced.json().profile.displayName, "Deniz K")
        assert.equal(spaced.json().profile.bio, "Slow coffee.")
      })
    }
  }
})
