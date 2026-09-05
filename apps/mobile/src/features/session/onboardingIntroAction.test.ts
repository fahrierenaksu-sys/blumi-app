import assert from "node:assert/strict"
import test from "node:test"
import { continueFromOnboardingIntro } from "./onboardingIntroAction"

test("a first-launch action persists intro completion before navigating", async () => {
  const order: string[] = []

  await continueFromOnboardingIntro({
    requiresCompletion: true,
    completeIntro: async () => { order.push("persist") },
    navigate: () => { order.push("navigate") }
  })

  assert.deepEqual(order, ["persist", "navigate"])
})

test("failed intro persistence never navigates", async () => {
  let navigated = false

  await assert.rejects(() => continueFromOnboardingIntro({
    requiresCompletion: true,
    completeIntro: async () => { throw new Error("storage unavailable") },
    navigate: () => { navigated = true }
  }))

  assert.equal(navigated, false)
})

test("returning users navigate without rewriting intro persistence", async () => {
  let persisted = false
  let navigated = false

  await continueFromOnboardingIntro({
    requiresCompletion: false,
    completeIntro: async () => { persisted = true },
    navigate: () => { navigated = true }
  })

  assert.equal(persisted, false)
  assert.equal(navigated, true)
})

test("optional handoff work completes after persistence and before navigation", async () => {
  const order: string[] = []

  await continueFromOnboardingIntro({
    requiresCompletion: true,
    completeIntro: async () => { order.push("persist") },
    beforeNavigate: async () => { order.push("handoff") },
    navigate: () => { order.push("navigate") }
  })

  assert.deepEqual(order, ["persist", "handoff", "navigate"])
})
