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

test("the handoff starts together with persistence and navigation waits for both", async () => {
  const order: string[] = []
  let persist!: () => void
  const action = continueFromOnboardingIntro({
    requiresCompletion: true,
    completeIntro: () => new Promise<void>((resolve) => {
      order.push("persist-start")
      persist = () => { order.push("persist-done"); resolve() }
    }),
    beforeNavigate: async () => { order.push("handoff") },
    navigate: () => { order.push("navigate") }
  })
  await Promise.resolve()
  assert.deepEqual(order, ["persist-start", "handoff"], "the world fades while the local write runs")
  persist()
  await action
  assert.deepEqual(order, ["persist-start", "handoff", "persist-done", "navigate"])
})

test("a failed persistence after the handoff started still never navigates", async () => {
  let navigated = false
  let handoff = false
  await assert.rejects(() => continueFromOnboardingIntro({
    requiresCompletion: true,
    completeIntro: async () => { throw new Error("storage unavailable") },
    beforeNavigate: async () => { handoff = true },
    navigate: () => { navigated = true }
  }))
  assert.equal(handoff, true)
  assert.equal(navigated, false)
})
