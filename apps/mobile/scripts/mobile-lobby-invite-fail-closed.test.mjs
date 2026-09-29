import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

// The fail-closed send boundary itself (disconnected, unjoined, transport
// refusal) is covered by src/features/lobby/lobbyInviteAttempt.test.ts.

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("ProfilePreview bounce never records optimistic success after a refused invite", () => {
  const lobby = read("src/screens/LobbyScreen.tsx")

  assert.match(
    lobby,
    /const inviteSent = sendInvite\(target\)[\s\S]*if \(!inviteSent\) \{[\s\S]*navigation\.setParams\(\{ pendingLikeUserId: undefined \}\)[\s\S]*return[\s\S]*\}[\s\S]*addPendingInvite\([\s\S]*markCandidateSeen\(target\)/,
    "the bounce must stop before pending/seen state when realtime refuses the invite"
  )
})
