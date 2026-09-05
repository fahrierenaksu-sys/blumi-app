import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "./authService"

async function createSignedInService() {
  const service = createAuthService({ codeFactory: () => "482931" })
  await service.sendCode("+905551112233")
  const signedIn = await service.verifyCode("+905551112233", "482931")
  return { service, token: signedIn.sessionToken }
}

test("profile prompt updates persist a normalized server-authoritative value", async () => {
  const { service, token } = await createSignedInService()
  const updated = await service.updateProfile(token, {
    prompts: [
      { promptId: "small_joy", answer: "  Fresh coffee   in the sun. " },
      { promptId: "ask_me_about", answer: "Neighborhood restaurants." }
    ]
  })
  assert.deepEqual(updated?.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee in the sun." },
    { promptId: "ask_me_about", answer: "Neighborhood restaurants." }
  ])
})

test("profile prompt updates reject unknown, duplicate, excessive, and long answers", async () => {
  const { service, token } = await createSignedInService()
  const invalid = [
    [{ promptId: "invented", answer: "No." }],
    [
      { promptId: "small_joy", answer: "One" },
      { promptId: "small_joy", answer: "Two" }
    ],
    [
      { promptId: "small_joy", answer: "One" },
      { promptId: "ask_me_about", answer: "Two" },
      { promptId: "ideal_sunday", answer: "Three" }
    ],
    [{ promptId: "small_joy", answer: "x".repeat(121) }]
  ]
  for (const prompts of invalid) {
    await assert.rejects(
      service.updateProfile(token, { prompts } as never),
      /prompt/i
    )
  }
})
