import assert from "node:assert/strict"
import test from "node:test"
import { resolveComposerRestore, resolveRoomComposerSubmit } from "./roomComposerModel"

test("a refused send keeps the composer text", () => {
  const sent: string[] = []
  const result = resolveRoomComposerSubmit("  merhaba  ", (body) => {
    sent.push(body)
    return false
  })
  assert.deepEqual(result, { kind: "refused" })
  assert.deepEqual(sent, ["merhaba"])
})

test("an accepted send clears the composer with the trimmed body", () => {
  const result = resolveRoomComposerSubmit("  merhaba  ", () => true)
  assert.deepEqual(result, { kind: "sent", body: "merhaba" })
})

test("blank text never reaches the chat", () => {
  let calls = 0
  const result = resolveRoomComposerSubmit("   \n ", () => {
    calls += 1
    return true
  })
  assert.deepEqual(result, { kind: "empty" })
  assert.equal(calls, 0)
})

test("a failed message comes back only into an empty composer", () => {
  const failed = { clientMessageId: "client-1", body: "tekrar dene" }
  assert.equal(resolveComposerRestore("", failed), "tekrar dene")
  assert.equal(resolveComposerRestore("yeni yazı", failed), "yeni yazı")
})

test("without a failed client message the composer is unchanged", () => {
  assert.equal(resolveComposerRestore("", null), "")
  assert.equal(resolveComposerRestore("", undefined), "")
  assert.equal(resolveComposerRestore("", { clientMessageId: "", body: "x" }), "")
  assert.equal(resolveComposerRestore("yazı", null), "yazı")
})
