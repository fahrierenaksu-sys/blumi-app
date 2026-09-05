import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(__dirname, "../../..")

function read(relativePath: string): string {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("the provider exposes a baseline only from confirmed server snapshots", () => {
  const provider = read("src/features/roomV2/state/RoomV2Provider.tsx")

  assert.match(
    provider,
    /serverSnapshot \? copyRoomV2Decor\(serverSnapshot\.decor\) : undefined/
  )
  assert.match(
    provider,
    /const snapshot = result\.kind === "saved"[\s\S]*?setConfirmedPersistedRoomDecor\(canonicalDecor\)/
  )
  assert.match(
    provider,
    /setConfirmedPersistedRoomDecor\(undefined\)[\s\S]*?setPersistenceState\("loading"\)/
  )
  assert.doesNotMatch(
    provider,
    /setConfirmedPersistedRoomDecor\(localDecor/
  )
  assert.match(
    provider,
    /const saveUserRoomDecorConfirmed = useCallback\(async[\s\S]*?const result = await savePersonalRoomDecor\([\s\S]*?if \(result\.kind === "conflict"\)[\s\S]*?return \{ status: "conflict" \}[\s\S]*?return \{ status: "saved", decor: canonicalDecor \}/
  )
})

test("the editor routes draft actions through the immutable session", () => {
  const editor = read("src/screens/MyRoomEditorScreen.tsx")

  assert.match(
    editor,
    /createRoomV2EditorSession\(userRoomDecor, confirmedPersistedRoomDecor\)/
  )
  assert.match(
    editor,
    /const nextSession = applyRoomV2EditorDraft\(currentSession, nextDecor\)/
  )
  assert.match(editor, /undoRoomV2EditorSession\(current\)/)
  assert.match(editor, /resetRoomV2EditorSession\(current\)/)
  assert.match(editor, /disabled=\{!editorSession\.canResetToPersistedBaseline\}/)
})

test("unsaved navigation offers save discard and stay without bypassing save validation", () => {
  const editor = read("src/screens/MyRoomEditorScreen.tsx")

  assert.match(editor, /navigation\.addListener\("beforeRemove"/)
  assert.match(editor, /if \(!editorSessionRef\.current\.isDirty\) return/)
  assert.match(editor, /text: "Stay in editor"/)
  assert.match(editor, /text: "Discard changes"/)
  assert.match(editor, /pendingEditorExitActionRef\.current = event\.data\.action[\s\S]*?handleSave\(\)/)
  assert.match(
    editor,
    /const requestedExitAction = pendingEditorExitActionRef\.current[\s\S]*?pendingEditorExitActionRef\.current = undefined/
  )
  assert.match(
    editor,
    /const confirmedSave = await saveRoomV2EditorDraftConfirmed\([\s\S]*?if \(confirmedSave\.status !== "saved"\)[\s\S]*?allowEditorExitRef\.current = true/
  )
  assert.doesNotMatch(editor, /setUserRoomDecor\(decorToSave\)/)
})
