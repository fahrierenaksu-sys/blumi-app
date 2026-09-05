import assert from "node:assert/strict"
import test from "node:test"
import {
  readPersonalRoomSyncMetadata,
  resolvePersonalRoomHydration,
  type PersonalRoomSyncMetadata
} from "./personalRoomDecorSyncModel"

const serverDecor = {
  roomShellId: "server-shell",
  placedItems: []
}
const localDecor = {
  roomShellId: "local-shell",
  placedItems: []
}
const syncMetadata: PersonalRoomSyncMetadata = {
  revision: 2,
  decorJson: JSON.stringify(serverDecor)
}

test("a locally pending Room edit retries when the server revision is unchanged", () => {
  assert.deepEqual(resolvePersonalRoomHydration({
    localDecor,
    serverSnapshot: {
      userId: "user_1",
      revision: 2,
      decor: serverDecor,
      updatedAt: "2026-07-26T12:00:00.000Z"
    },
    syncMetadata
  }), {
    decor: localDecor,
    revision: 2,
    lastSyncedDecorJson: JSON.stringify(serverDecor),
    needsServerSave: true,
    conflictRecovered: false
  })
})

test("a newer cross-device Room revision wins over a stale local outbox", () => {
  const newerServerDecor = {
    roomShellId: "newer-server-shell",
    placedItems: []
  }
  assert.deepEqual(resolvePersonalRoomHydration({
    localDecor,
    serverSnapshot: {
      userId: "user_1",
      revision: 3,
      decor: newerServerDecor,
      updatedAt: "2026-07-26T12:05:00.000Z"
    },
    syncMetadata
  }), {
    decor: newerServerDecor,
    revision: 3,
    lastSyncedDecorJson: JSON.stringify(newerServerDecor),
    needsServerSave: false,
    conflictRecovered: true
  })
})

test("first server save migrates an existing local Room layout", () => {
  assert.deepEqual(resolvePersonalRoomHydration({
    localDecor,
    serverSnapshot: null,
    syncMetadata: null
  }), {
    decor: localDecor,
    revision: 0,
    lastSyncedDecorJson: "",
    needsServerSave: true,
    conflictRecovered: false
  })
})

test("stored sync metadata fails closed when revision or canonical decor is invalid", () => {
  assert.deepEqual(
    readPersonalRoomSyncMetadata(JSON.stringify(syncMetadata)),
    syncMetadata
  )
  assert.equal(
    readPersonalRoomSyncMetadata(JSON.stringify({
      revision: -1,
      decorJson: "{}"
    })),
    null
  )
  assert.equal(readPersonalRoomSyncMetadata("{"), null)
})
