import assert from "node:assert/strict"
import test from "node:test"
import {
  completeAvatarStepAndNavigate,
  completeProfileStepAndNavigate,
  resolveAvatarSetupInitialGender
} from "./onboardingFlowModel"

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test("profile setup navigates with selected gender while the durable save is pending", async () => {
  const save = deferred()
  const calls: string[] = []
  let navigationParams: { initialGender?: string } | undefined
  let settled = false

  const completion = completeProfileStepAndNavigate({
    input: { gender: "man" },
    mode: "first-completion",
    reviewReturnTarget: "RoomSetup",
    save: () => { calls.push("save"); return save.promise },
    replace: (route, params) => {
      calls.push(route)
      navigationParams = params
    }
  }).then(() => { settled = true })

  assert.deepEqual(calls, ["save", "AvatarSetup"])
  assert.equal(navigationParams?.initialGender, "man")
  await Promise.resolve()
  assert.equal(settled, false, "the screen keeps its submitting state until the save settles")
  save.resolve()
  await completion
  assert.equal(settled, true)
})

test("profile review returns to its requested step after starting the save", async () => {
  const save = deferred()
  const calls: string[] = []

  const completion = completeProfileStepAndNavigate({
    input: { gender: "woman" },
    mode: "review",
    reviewReturnTarget: "RoomSetup",
    save: () => { calls.push("save"); return save.promise },
    replace: (route) => { calls.push(route) }
  })

  assert.deepEqual(calls, ["save", "RoomSetup"])
  save.resolve()
  await completion
})

test("a failed profile save still surfaces its error to the screen", async () => {
  await assert.rejects(
    completeProfileStepAndNavigate({
      input: { gender: "woman" },
      mode: "first-completion",
      reviewReturnTarget: "AvatarSetup",
      save: () => Promise.reject(new Error("offline")),
      replace: () => {}
    }),
    /offline/
  )
})

test("avatar setup waits for persistence before entering room setup", async () => {
  const save = deferred()
  const calls: string[] = []

  const completion = completeAvatarStepAndNavigate({
    avatar: {},
    save: () => { calls.push("save"); return save.promise },
    replace: (route) => { calls.push(route) }
  })

  assert.deepEqual(calls, ["save"])
  save.resolve()
  await completion
  assert.deepEqual(calls, ["save", "RoomSetup"])
})

test("a failed avatar save never enters room setup", async () => {
  const calls: string[] = []
  await assert.rejects(
    completeAvatarStepAndNavigate({
      avatar: {},
      save: () => Promise.reject(new Error("offline")),
      replace: (route) => { calls.push(route) }
    }),
    /offline/
  )
  assert.deepEqual(calls, [])
})

test("avatar first frame prefers the chosen gender and falls back to the saved profile", () => {
  assert.equal(resolveAvatarSetupInitialGender("man", "woman"), "man")
  assert.equal(resolveAvatarSetupInitialGender(undefined, "woman"), "woman")
})
