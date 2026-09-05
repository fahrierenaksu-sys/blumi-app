import assert from "node:assert/strict"
import test from "node:test"
import type { UserRoomDecor } from "./roomV2.types"
import {
  applyRoomV2EditorDraft,
  createRoomV2EditorSession,
  markRoomV2EditorSessionSaved,
  resetRoomV2EditorSession,
  undoRoomV2EditorSession,
  updateRoomV2EditorPersistedBaseline
} from "./roomV2EditorSession"

function decor(
  roomShellId: string,
  itemIds: readonly string[] = []
): UserRoomDecor {
  return {
    schemaVersion: 2,
    roomShellId,
    placedItems: itemIds.map((itemId, index) => ({
      instanceId: `${itemId}-${index}`,
      itemId,
      x: 0.2 + index * 0.1,
      y: 0.6,
      rotation: "front"
    }))
  }
}

test("creates an immutable clean session from the last saved decor", () => {
  const saved = decor("starter", ["bed"])
  const session = createRoomV2EditorSession(saved)

  saved.placedItems[0]!.x = 0.9

  assert.equal(session.isDirty, false)
  assert.equal(session.canUndo, false)
  assert.equal(session.baselineDecor.placedItems[0]!.x, 0.2)
  assert.notEqual(session.baselineDecor, session.draftDecor)
  assert.notEqual(session.baselineDecor.placedItems, session.draftDecor.placedItems)
})

test("a draft action records exactly one immutable undo snapshot", () => {
  const initial = createRoomV2EditorSession(decor("starter", ["bed"]))
  const moved = applyRoomV2EditorDraft(initial, {
    ...initial.draftDecor,
    placedItems: initial.draftDecor.placedItems.map((item) => ({
      ...item,
      x: 0.7
    }))
  })
  const rotated = applyRoomV2EditorDraft(moved, {
    ...moved.draftDecor,
    placedItems: moved.draftDecor.placedItems.map((item) => ({
      ...item,
      rotation: "right"
    }))
  })

  assert.equal(rotated.isDirty, true)
  assert.equal(rotated.canUndo, true)
  assert.equal(rotated.draftDecor.placedItems[0]!.rotation, "right")
  assert.equal(rotated.undoDecor?.placedItems[0]!.x, 0.7)
  assert.equal(rotated.undoDecor?.placedItems[0]!.rotation, "front")
  assert.equal(initial.draftDecor.placedItems[0]!.x, 0.2)
})

test("undo restores only the immediately previous add move rotate or remove action", () => {
  const initial = createRoomV2EditorSession(decor("starter", ["bed"]))
  const added = applyRoomV2EditorDraft(initial, decor("starter", ["bed", "lamp"]))
  const removed = applyRoomV2EditorDraft(added, decor("starter", ["lamp"]))
  const undone = undoRoomV2EditorSession(removed)

  assert.deepEqual(
    undone.draftDecor.placedItems.map((item) => item.itemId),
    ["bed", "lamp"]
  )
  assert.equal(undone.canUndo, false)
  assert.equal(undone.isDirty, true)
  assert.equal(undoRoomV2EditorSession(undone), undone)
})

test("a no-op draft action does not replace the available undo snapshot", () => {
  const initial = createRoomV2EditorSession(decor("starter", ["bed"]))
  const changed = applyRoomV2EditorDraft(initial, decor("starter", ["bed", "lamp"]))
  const noOp = applyRoomV2EditorDraft(changed, {
    ...changed.draftDecor,
    placedItems: changed.draftDecor.placedItems.map((item) => ({ ...item }))
  })

  assert.equal(noOp, changed)
  assert.deepEqual(noOp.undoDecor, initial.draftDecor)
})

test("reset always returns to the saved baseline instead of the current draft", () => {
  const confirmed = decor("server-save", ["bed"])
  const initial = createRoomV2EditorSession(confirmed, confirmed)
  const changed = applyRoomV2EditorDraft(initial, decor("preview", ["lamp"]))
  const reset = resetRoomV2EditorSession(changed)

  assert.deepEqual(reset.draftDecor, initial.baselineDecor)
  assert.notEqual(reset.draftDecor, reset.baselineDecor)
  assert.equal(reset.isDirty, false)
  assert.equal(reset.canUndo, true)
})

test("only a successful save advances the baseline and clears undo", () => {
  const confirmed = decor("server-save", ["bed"])
  const initial = createRoomV2EditorSession(confirmed, confirmed)
  const changed = applyRoomV2EditorDraft(initial, decor("new-save", ["bed", "lamp"]))
  const saved = markRoomV2EditorSessionSaved(changed, changed.draftDecor)
  const editedAgain = applyRoomV2EditorDraft(saved, decor("preview", ["lamp"]))
  const reset = resetRoomV2EditorSession(editedAgain)

  assert.equal(saved.isDirty, false)
  assert.equal(saved.canUndo, false)
  assert.equal(saved.baselineDecor.roomShellId, "new-save")
  assert.deepEqual(reset.draftDecor, saved.baselineDecor)
})

test("reset is fail-closed when no confirmed server baseline exists", () => {
  const initial = createRoomV2EditorSession(decor("local-entry", ["bed"]))
  const changed = applyRoomV2EditorDraft(initial, decor("preview", ["lamp"]))

  assert.equal(changed.canResetToPersistedBaseline, false)
  assert.equal(resetRoomV2EditorSession(changed), changed)
})

test("a later server confirmation updates reset without overwriting the active draft", () => {
  const initial = createRoomV2EditorSession(decor("entry", ["bed"]))
  const changed = applyRoomV2EditorDraft(initial, decor("preview", ["lamp"]))
  const confirmed = decor("confirmed-later", ["bed", "lamp"])
  const refreshed = updateRoomV2EditorPersistedBaseline(changed, confirmed)

  assert.deepEqual(refreshed.draftDecor, changed.draftDecor)
  assert.deepEqual(refreshed.undoDecor, changed.undoDecor)
  assert.equal(refreshed.isDirty, true)
  assert.deepEqual(
    resetRoomV2EditorSession(refreshed).draftDecor,
    confirmed
  )
})
