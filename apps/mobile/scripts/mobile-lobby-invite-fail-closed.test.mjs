import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

function loadInviteAttempt() {
  const sourceText = read("src/features/lobby/useLobbyFlow.ts")
  const sourceFile = ts.createSourceFile(
    "useLobbyFlow.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "trySendLobbyInvite"
  )

  assert.ok(
    declaration,
    "useLobbyFlow must expose a testable fail-closed invite boundary"
  )

  const transpiled = ts.transpileModule(
    declaration.getText(sourceFile),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText
  const module = { exports: {} }
  vm.runInNewContext(transpiled, { module, exports: module.exports })
  return module.exports.trySendLobbyInvite
}

test("lobby invite refuses disconnected and unjoined attempts without sending", () => {
  const trySendLobbyInvite = loadInviteAttempt()
  const sentEvents = []
  const send = (event) => sentEvents.push(event)

  assert.equal(
    trySendLobbyInvite({
      connectionStatus: "disconnected",
      isJoined: true,
      roomId: "public-lobby",
      recipientUserId: "user-b",
      send
    }),
    false
  )
  assert.equal(
    trySendLobbyInvite({
      connectionStatus: "connected",
      isJoined: false,
      roomId: "public-lobby",
      recipientUserId: "user-b",
      send
    }),
    false
  )
  assert.deepEqual(sentEvents, [])
})

test("lobby invite reports success only after handing the exact event to realtime", () => {
  const trySendLobbyInvite = loadInviteAttempt()
  const sentEvents = []

  assert.equal(
    trySendLobbyInvite({
      connectionStatus: "connected",
      isJoined: true,
      roomId: "public-lobby",
      recipientUserId: "user-b",
      send: (event) => sentEvents.push(event)
    }),
    true
  )
  assert.deepEqual(sentEvents, [
    {
      type: "mini_room.invite",
      payload: {
        roomId: "public-lobby",
        recipientUserId: "user-b"
      }
    }
  ])
})

test("ProfilePreview bounce never records optimistic success after a refused invite", () => {
  const lobby = read("src/screens/LobbyScreen.tsx")

  assert.match(
    lobby,
    /const inviteSent = sendInvite\(target\)[\s\S]*if \(!inviteSent\) \{[\s\S]*navigation\.setParams\(\{ pendingLikeUserId: undefined \}\)[\s\S]*return[\s\S]*\}[\s\S]*addPendingInvite\([\s\S]*markCandidateSeen\(target\)/,
    "the bounce must stop before pending/seen state when realtime refuses the invite"
  )
})
