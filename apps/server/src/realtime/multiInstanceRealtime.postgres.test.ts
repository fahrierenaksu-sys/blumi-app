// Audit D09: two server instances, each with its own pool and LISTEN connection, share one database. Events and
// access revocations published by one instance must reach the other through PostgreSQL, and never echo back.
import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import type { ServerEvent } from "@blumi/contracts"
import { disposablePostgresSkip, disposablePostgresUrl } from "../db/disposablePostgres"
import { createPostgresRealtimeFanout } from "../db/postgresRealtimeFanout"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import { createConnectionManager } from "./connectionManager"

const EVENT = {
  type: "connection.matched",
  payload: { miniRoomId: "room_1", participantUserIds: ["user_1", "user_2"], matchedAt: "2026-07-22T10:00:00.000Z" }
} as unknown as ServerEvent

function createSocket() {
  return {
    readyState: 1,
    sent: [] as string[],
    close(this: { readyState: number }) { this.readyState = 3 },
    send(this: { sent: string[] }, value: string) { this.sent.push(value) }
  }
}

function createProfile(userId: string) {
  return { userId, displayName: "Mina", age: 24, bio: "", distanceLabel: "Nearby", vibeTags: [], signals: [], avatar: { presetId: "dusk" } }
}

async function waitFor(condition: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail(message)
}

test("two instances on one database deliver user and room events to each other once, and share revocations", {
  skip: disposablePostgresSkip().skip, timeout: 15_000
}, async () => {
  const connectionString = disposablePostgresUrl(process.env.DATABASE_URL?.trim())
  const poolA = new Pool({ connectionString })
  const poolB = new Pool({ connectionString })
  const fanoutA = createPostgresRealtimeFanout(poolA)
  const fanoutB = createPostgresRealtimeFanout(poolB)
  const instanceA = createConnectionManager({ fanout: fanoutA, instanceId: "instance_a" })
  const instanceB = createConnectionManager({ fanout: fanoutB, instanceId: "instance_b" })
  const revokedOnA: RealtimeAccessRevocation[] = []
  const revokedOnB: RealtimeAccessRevocation[] = []
  const stopA = instanceA.subscribeAccessRevocations((revocation) => revokedOnA.push(revocation))
  const stopB = instanceB.subscribeAccessRevocations((revocation) => revokedOnB.push(revocation))
  try {
    const localOnA = createSocket()
    const remoteOnB = createSocket()
    const roomOnB = createSocket()
    instanceA.addConnection({ socket: localOnA as never, profile: createProfile("user_2") as never })
    instanceB.addConnection({ socket: remoteOnB as never, profile: createProfile("user_2") as never })
    const roomConnection = instanceB.addConnection({ socket: roomOnB as never, profile: createProfile("user_3") as never })
    instanceB.joinRoom(roomConnection.connectionId, "lobby")
    await instanceA.startFanout()
    await instanceB.startFanout()

    instanceA.sendToUser("user_2", EVENT)
    instanceA.broadcastRoom("lobby", EVENT)
    await waitFor(() => remoteOnB.sent.length === 1 && roomOnB.sent.length === 1, "instance B did not receive the events")
    assert.deepEqual(JSON.parse(remoteOnB.sent[0]!), JSON.parse(JSON.stringify(EVENT)))
    assert.equal(localOnA.sent.length, 1, "the publishing instance delivers locally exactly once")

    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(localOnA.sent.length, 1, "no echo back to the publisher")
    assert.equal(remoteOnB.sent.length, 1, "no duplicate on the receiver")

    await fanoutA.publishAccessRevocation({ kind: "user", userId: "user_2" })
    await waitFor(() => revokedOnB.length === 1, "instance B did not receive the revocation")
    assert.deepEqual(revokedOnB, [{ kind: "user", userId: "user_2" }])
    assert.deepEqual(revokedOnA, [], "the publisher handles its own revocation locally, not through the bus")
  } finally {
    stopA()
    stopB()
    await instanceA.closeFanout()
    await instanceB.closeFanout()
    await poolA.end()
    await poolB.end()
  }
})
