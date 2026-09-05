import assert from "node:assert/strict"
import test from "node:test"
import { runAvatarEquipSave } from "./avatarEquipSave"

test("the first failed avatar save returns the same server message to its caller", async () => {
  const result = await runAvatarEquipSave({
    nextAvatar: { topId: "avatar_v2_top_test" },
    save: async () => {
      throw new Error("Your session expired. Sign in again.")
    }
  })

  assert.deepEqual(result, {
    ok: false,
    errorMessage: "Your session expired. Sign in again."
  })
})

test("non-Error avatar save failures use the product-safe fallback", async () => {
  const result = await runAvatarEquipSave({
    nextAvatar: { topId: "avatar_v2_top_test" },
    save: async () => {
      throw "offline"
    }
  })

  assert.deepEqual(result, {
    ok: false,
    errorMessage: "We could not save that look yet."
  })
})

test("blank Error messages use the product-safe fallback", async () => {
  const result = await runAvatarEquipSave({
    nextAvatar: { topId: "avatar_v2_top_test" },
    save: async () => {
      throw new Error("   ")
    }
  })

  assert.deepEqual(result, {
    ok: false,
    errorMessage: "We could not save that look yet."
  })
})

test("network failures never leak a technical error into the wardrobe", async () => {
  const result = await runAvatarEquipSave({
    nextAvatar: { topId: "avatar_v2_top_test" },
    save: async () => {
      throw new Error("Network request failed")
    }
  })

  assert.deepEqual(result, {
    ok: false,
    errorMessage: "We could not reach Blumi. Check your connection and try again."
  })
})

test("aborted avatar saves get the same retryable product message", async () => {
  const result = await runAvatarEquipSave({
    nextAvatar: { topId: "avatar_v2_top_test" },
    save: async () => {
      throw new DOMException("The operation was aborted", "AbortError")
    }
  })

  assert.deepEqual(result, {
    ok: false,
    errorMessage: "We could not reach Blumi. Check your connection and try again."
  })
})
