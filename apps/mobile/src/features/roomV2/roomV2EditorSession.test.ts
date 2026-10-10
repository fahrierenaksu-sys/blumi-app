import assert from "node:assert/strict"
import test from "node:test"
import type { UserRoomDecor } from "./roomV2.types"
import {
  applyRoomV2EditorDraft,
  createRoomV2EditorSession,
  markRoomV2EditorSessionSaved,
  redoRoomV2EditorSession,
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

function moveFirst(session: ReturnType<typeof createRoomV2EditorSession>, x: number) {
  return applyRoomV2EditorDraft(session, {
    ...session.draftDecor,
    placedItems: session.draftDecor.placedItems.map((item, index) => index === 0 ? { ...item, x } : item)
  })
}

test("with a deeper history, undo walks back step by step and redo walks forward again", () => {
  let session = createRoomV2EditorSession(decor("starter", ["bed"]), undefined, { historyLimit: 30 })
  for (const x of [0.3, 0.4, 0.5]) session = moveFirst(session, x)

  const back1 = undoRoomV2EditorSession(session)
  const back2 = undoRoomV2EditorSession(back1)
  const back3 = undoRoomV2EditorSession(back2)
  assert.deepEqual([back1, back2, back3].map((step) => step.draftDecor.placedItems[0]!.x), [0.4, 0.3, 0.2])
  assert.equal(back3.canUndo, false)
  assert.equal(back3.isDirty, false)
  assert.equal(back3.canRedo, true)

  const forward1 = redoRoomV2EditorSession(back3)
  const forward2 = redoRoomV2EditorSession(forward1)
  const forward3 = redoRoomV2EditorSession(forward2)
  assert.deepEqual([forward1, forward2, forward3].map((step) => step.draftDecor.placedItems[0]!.x), [0.3, 0.4, 0.5])
  assert.equal(forward3.canRedo, false)
  assert.equal(redoRoomV2EditorSession(forward3), forward3)
})

test("a new change after undo drops the redo branch", () => {
  let session = createRoomV2EditorSession(decor("starter", ["bed"]), undefined, { historyLimit: 30 })
  session = moveFirst(moveFirst(session, 0.3), 0.4)
  const undone = undoRoomV2EditorSession(session)
  assert.equal(undone.canRedo, true)
  const branched = moveFirst(undone, 0.6)
  assert.equal(branched.canRedo, false)
  assert.equal(undoRoomV2EditorSession(branched).draftDecor.placedItems[0]!.x, 0.3)
})

test("the history keeps only its newest steps", () => {
  let session = createRoomV2EditorSession(decor("starter", ["bed"]), undefined, { historyLimit: 3 })
  for (const x of [0.3, 0.4, 0.5, 0.6, 0.7]) session = moveFirst(session, x)
  let steps = 0
  while (session.canUndo) {
    session = undoRoomV2EditorSession(session)
    steps += 1
  }
  assert.equal(steps, 3)
  assert.equal(session.draftDecor.placedItems[0]!.x, 0.4)
})

test("the default single-step undo keeps no redo, as before", () => {
  const session = moveFirst(moveFirst(createRoomV2EditorSession(decor("starter", ["bed"])), 0.3), 0.4)
  const undone = undoRoomV2EditorSession(session)
  assert.equal(undone.draftDecor.placedItems[0]!.x, 0.3)
  assert.equal(undone.canUndo, false)
  assert.equal(undone.canRedo, false)
})

test("history snapshots are private copies and a confirmed save starts a fresh history", () => {
  let session = createRoomV2EditorSession(decor("starter", ["bed"]), undefined, { historyLimit: 30 })
  const next = decor("starter", ["bed"])
  next.placedItems[0]!.x = 0.3
  session = moveFirst(applyRoomV2EditorDraft(session, next), 0.4)
  // the caller's object changes later; the history keeps what was applied
  next.placedItems[0]!.x = 0.99
  assert.equal(undoRoomV2EditorSession(session).draftDecor.placedItems[0]!.x, 0.3)
  assert.equal(undoRoomV2EditorSession(undoRoomV2EditorSession(session)).draftDecor.placedItems[0]!.x, 0.2)

  const saved = markRoomV2EditorSessionSaved(session, session.draftDecor)
  assert.equal(saved.canUndo, false)
  assert.equal(saved.canRedo, false)
  assert.equal(saved.historyLimit, 30)
  assert.equal(saved.isDirty, false)
})

