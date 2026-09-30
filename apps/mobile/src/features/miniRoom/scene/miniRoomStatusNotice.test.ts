import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomStatusNotice } from "./miniRoomStatusNotice"

test("a connected room shows no status notice", () => {
  assert.equal(resolveMiniRoomStatusNotice("connected"), null)
})

test("connecting, reconnecting and failure each get one explicit notice", () => {
  assert.equal(resolveMiniRoomStatusNotice("idle"), "connecting")
  assert.equal(resolveMiniRoomStatusNotice("connecting"), "connecting")
  assert.equal(resolveMiniRoomStatusNotice("disconnected"), "reconnecting")
  assert.equal(resolveMiniRoomStatusNotice("error"), "failed")
})
