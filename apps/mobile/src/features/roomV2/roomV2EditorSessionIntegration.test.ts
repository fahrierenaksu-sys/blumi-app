import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
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
  const screen = read("src/screens/MyRoomEditorScreen.tsx")
  // The session lifecycle lives in the editor feature hook the screen composes.
  const editor = read("src/features/roomV2/editor/useRoomEditorSession.ts")
  const controls = read("src/features/roomV2/editor/RoomEditorInventoryControls.tsx")

  assert.match(screen, /const session = useRoomEditorSession\(\{/)
  assert.match(screen, /handleResetDraft=\{session\.handleResetDraft\}/)
  assert.match(screen, /onUndo=\{session\.handleUndoDraft\}/)
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
  assert.match(controls, /disabled=\{!editorSession\.canResetToPersistedBaseline\}/)
})

test("unsaved navigation offers save discard and stay without bypassing save validation", () => {
  const screen = read("src/screens/MyRoomEditorScreen.tsx")
  // Save and the exit guard live together in the editor feature save hook.
  const editor = read("src/features/roomV2/editor/useRoomEditorSave.ts")
  const editorSurface = [
    screen,
    ...readdirSync(resolve(mobileRoot, "src/features/roomV2/editor"))
      .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
      .map((fileName) => read(`src/features/roomV2/editor/${fileName}`))
  ].join("\n")

  assert.match(screen, /editorSessionRef: session\.editorSessionRef/)
  // usePreventRemove (not a bare beforeRemove listener) so native-stack can
  // cancel the iOS swipe-back instead of popping the native page first.
  assert.doesNotMatch(editor, /addListener\("beforeRemove"/)
  assert.match(editor, /usePreventRemove\(isDirty, \(\{ data \}\) => \{/)
  assert.match(editor, /if \(allowEditorExitRef\.current \|\| !editorSessionRef\.current\.isDirty\) \{/)
  assert.match(editor, /text: copy\.unsavedDialog\.stay/)
  assert.match(editor, /text: copy\.unsavedDialog\.discard/)
  assert.match(editor, /text: copy\.save/)
  assert.match(editor, /pendingEditorExitActionRef\.current = data\.action[\s\S]*?handleSave\(\)/)
  assert.match(
    editor,
    /const requestedExitAction = pendingEditorExitActionRef\.current[\s\S]*?pendingEditorExitActionRef\.current = undefined/
  )
  assert.match(
    editor,
    /const confirmedSave = await saveRoomV2EditorDraftConfirmed\([\s\S]*?if \(confirmedSave\.status !== "saved"\)[\s\S]*?allowEditorExitRef\.current = true/
  )
  assert.doesNotMatch(editorSurface, /setUserRoomDecor\(decorToSave\)/)
})
