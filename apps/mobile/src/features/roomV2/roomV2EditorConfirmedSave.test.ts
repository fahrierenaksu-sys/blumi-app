import assert from "node:assert/strict"
import test from "node:test"
import type { UserRoomDecor } from "./roomV2.types"
import { saveRoomV2EditorDraftConfirmed } from "./roomV2EditorConfirmedSave"

const draft: UserRoomDecor = {
  roomShellId: "starter",
  placedItems: []
}

test("editor save succeeds only after the provider confirms a server save", async () => {
  const canonical: UserRoomDecor = {
    roomShellId: "canonical",
    placedItems: []
  }
  const result = await saveRoomV2EditorDraftConfirmed(
    draft,
    async () => ({ status: "saved", decor: canonical })
  )

  assert.deepEqual(result, { status: "saved", decor: canonical })
})

test("editor save keeps the editor open on revision conflict", async () => {
  const result = await saveRoomV2EditorDraftConfirmed(
    draft,
    async () => ({ status: "conflict" })
  )

  assert.deepEqual(result, {
    status: "blocked",
    feedback: "A newer room was found. Reset or review your room, then save again."
  })
})

test("editor save keeps the editor open when server persistence is unavailable", async () => {
  const result = await saveRoomV2EditorDraftConfirmed(
    draft,
    async () => ({ status: "failed" })
  )

  assert.deepEqual(result, {
    status: "blocked",
    feedback: "Your room could not be confirmed by Blumi. Try again."
  })
})

test("editor save does not convert a thrown network failure into success", async () => {
  const result = await saveRoomV2EditorDraftConfirmed(
    draft,
    async () => {
      throw new Error("network diagnostics")
    }
  )

  assert.deepEqual(result, {
    status: "blocked",
    feedback: "Your room could not be confirmed by Blumi. Try again."
  })
})
