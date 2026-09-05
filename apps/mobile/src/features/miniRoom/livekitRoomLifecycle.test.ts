import assert from "node:assert/strict"
import test from "node:test"
import { EventEmitter } from "node:events"
import { closeOwnedMediaClient, createMediaClientRegistry, createMicrophoneRequestGate, createRoomMediaClient, MediaClientOwnershipError } from "./livekitRoomLifecycle"

test("failed unmount shutdown prevents a separate mount from creating a second client", async () => {
  const registry = createMediaClientRegistry()
  let created = 0, canClose = false
  const factory = () => { created++; return { async disconnect() { if (!canClose) throw new Error("capture remains") } } }
  const first = await registry.acquire(factory)
  await assert.rejects(first.disconnect())
  await assert.rejects(registry.acquire(factory))
  assert.equal(created, 1)
  canClose = true
  const second = await registry.acquire(factory)
  assert.equal(created, 2)
  await second.disconnect()
})

test("blocked new mount receives actual old capture state and independent registries are isolated", async () => {
  const registry = createMediaClientRegistry(), isolated = createMediaClientRegistry()
  const { room, client } = fixture()
  const first = await registry.acquire(() => client)
  await first.connect({ livekitUrl: "url", token: "token" })
  await first.setMicrophoneEnabled(true)
  room.disconnect = async () => { throw new Error("shutdown failed") }
  await assert.rejects(first.disconnect())
  await assert.rejects(registry.acquire(() => { throw new Error("must not create") }), (error) =>
    error instanceof MediaClientOwnershipError && error.micEnabled === true)
  const other = await isolated.acquire(() => ({ async disconnect() {} }))
  await other.disconnect()
})

test("concurrent new mounts serialize acquisition and cannot bypass failed shutdown", async () => {
  const registry = createMediaClientRegistry()
  let created = 0
  const factory = () => { created++; return { async disconnect() { throw new Error("shutdown failed") } } }
  const results = await Promise.allSettled([registry.acquire(factory), registry.acquire(factory)])
  assert.equal(results[0].status, "fulfilled")
  assert.equal(results[1].status, "rejected")
  assert.equal(created, 1)
})

test("failed disconnect retains ownership and retry closes the same client before replacement", async () => {
  let attempts = 0
  const client = { async disconnect() { attempts++; if (attempts === 1) throw new Error("still capturing") } }
  const owner = { current: client as typeof client | null }
  await assert.rejects(closeOwnedMediaClient(owner), /still capturing/)
  assert.equal(owner.current, client)
  await closeOwnedMediaClient(owner)
  assert.equal(attempts, 2)
  assert.equal(owner.current, null)
})

test("failed native disconnect keeps SDK observations alive until successful retry", async () => {
  const { room, client } = fixture()
  const owner = { current: client as typeof client | null }
  let mic = false
  client.subscribe((state) => { mic = state.micEnabled })
  await client.connect({ livekitUrl: "url", token: "token" })
  await client.setMicrophoneEnabled(true)
  const disconnect = room.disconnect.bind(room)
  room.disconnect = async () => { throw new Error("disconnect failed") }
  await assert.rejects(closeOwnedMediaClient(owner))
  assert.equal(owner.current, client)
  assert.equal(mic, true)
  assert.equal(room.listenerCount("trackMuted"), 1)
  room.localParticipant.isMicrophoneEnabled = false; room.emit("trackMuted")
  assert.equal(mic, false)
  room.disconnect = disconnect
  await closeOwnedMediaClient(owner)
  assert.equal(owner.current, null)
  assert.equal(room.listenerCount("trackMuted"), 0)
})

test("concurrent cleanup and retry await one disconnect before releasing ownership", async () => {
  let release!: () => void
  let calls = 0
  const client = { async disconnect() { calls++; await new Promise<void>((resolve) => { release = resolve }) } }
  const owner = { current: client as typeof client | null }
  const first = closeOwnedMediaClient(owner), second = closeOwnedMediaClient(owner)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  assert.equal(owner.current, client)
  release(); await Promise.all([first, second])
  assert.equal(owner.current, null)
})

test("old client's pending microphone request cannot block or unlock its replacement", () => {
  const gate = createMicrophoneRequestGate()
  const oldClient = {}, newClient = {}
  const finishOld = gate.begin(oldClient)!
  assert.equal(gate.begin(oldClient), null)
  const finishNew = gate.begin(newClient)!
  assert.equal(typeof finishNew, "function")
  finishOld()
  assert.equal(gate.begin(newClient), null)
  finishNew()
  assert.equal(typeof gate.begin(newClient), "function")
})

test("late microphone enable after reconnect is corrected and disposed listeners stay silent", async () => {
  const { room, client } = fixture()
  const states: { micEnabled: boolean }[] = []
  client.subscribe((state) => states.push(state))
  await client.connect({ livekitUrl: "url", token: "token" })
  let release!: () => void
  const original = room.localParticipant.setMicrophoneEnabled.bind(room.localParticipant)
  room.localParticipant.setMicrophoneEnabled = async (enabled) => {
    if (enabled) await new Promise<void>((resolve) => { release = resolve })
    await original(enabled)
  }
  const enabling = client.setMicrophoneEnabled(true)
  room.state = "reconnecting"; room.emit("reconnecting")
  release(); await enabling
  assert.equal(room.localParticipant.isMicrophoneEnabled, false)
  assert.equal(states.at(-1)?.micEnabled, false)
  await client.disconnect()
  const count = states.length
  room.emit("reconnected"); room.emit("trackUnmuted")
  assert.equal(states.length, count)
  assert.equal(room.listenerCount("reconnected"), 0)
})

function fixture() {
  const events = new EventEmitter()
  const room = Object.assign(events, { state: "disconnected", localParticipant: {
    isMicrophoneEnabled: false,
    async setMicrophoneEnabled(enabled: boolean) { this.isMicrophoneEnabled = enabled; events.emit(enabled ? "trackUnmuted" : "trackMuted") }
  }, async connect() { this.state = "connected"; events.emit("connectionStateChanged", "connected") },
  async disconnect() { this.state = "disconnected"; events.emit("disconnected") } })
  return { room, client: createRoomMediaClient(room) }
}

test("SDK disconnect/mute events are reflected, reconnect never restores microphone intent", async () => {
  const { room, client } = fixture()
  const states: { connectionStatus: string; micEnabled: boolean }[] = []
  client.subscribe((state) => states.push(state))
  await client.connect({ livekitUrl: "url", token: "token" })
  await client.setMicrophoneEnabled(true)
  assert.equal(states.at(-1)?.micEnabled, true)
  room.state = "reconnecting"
  room.emit("reconnecting")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.localParticipant.isMicrophoneEnabled, false)
  assert.equal(states.at(-1)?.connectionStatus, "connecting")
  room.state = "connected"
  room.emit("reconnected")
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(states.at(-1), { connectionStatus: "connected", micEnabled: false, errorMessage: null })
  room.emit("disconnected")
  assert.equal(states.at(-1)?.connectionStatus, "disconnected")
  assert.equal(states.at(-1)?.micEnabled, false)
})

test("failed microphone request never publishes optimistic microphone-on state", async () => {
  const { room, client } = fixture()
  let mic = false
  client.subscribe((state) => { mic = state.micEnabled })
  await client.connect({ livekitUrl: "url", token: "token" })
  room.localParticipant.setMicrophoneEnabled = async () => { throw new Error("permission denied") }
  await assert.rejects(client.setMicrophoneEnabled(true), /permission denied/)
  assert.equal(mic, false)
})

test("connection is not shown as ready until pending mute is confirmed", async () => {
  const { room, client } = fixture()
  let state = "idle"
  client.subscribe((snapshot) => { state = snapshot.connectionStatus })
  let release!: () => void
  room.localParticipant.setMicrophoneEnabled = async () => { await new Promise<void>((resolve) => { release = resolve }) }
  const connecting = client.connect({ livekitUrl: "url", token: "token" })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state, "connecting")
  release(); await connecting
  assert.equal(state, "connected")
})

test("failed disable still reports the actual active microphone", async () => {
  const { room, client } = fixture()
  let mic = false
  client.subscribe((state) => { mic = state.micEnabled })
  await client.connect({ livekitUrl: "url", token: "token" })
  await client.setMicrophoneEnabled(true)
  room.localParticipant.setMicrophoneEnabled = async () => { throw new Error("device failed") }
  await assert.rejects(client.setMicrophoneEnabled(false))
  assert.equal(mic, true)
})

test("mute and disconnect double failure never reports an active microphone as off", async () => {
  const { room, client } = fixture()
  const states: { connectionStatus: string; micEnabled: boolean }[] = []
  client.subscribe((state) => states.push(state))
  await client.connect({ livekitUrl: "url", token: "token" })
  await client.setMicrophoneEnabled(true)
  room.localParticipant.setMicrophoneEnabled = async () => { throw new Error("mute failed") }
  room.disconnect = async () => { throw new Error("disconnect failed") }
  room.state = "reconnecting"; room.emit("reconnecting")
  assert.equal(states.at(-1)?.connectionStatus, "connecting")
  assert.equal(states.at(-1)?.micEnabled, true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.localParticipant.isMicrophoneEnabled, true)
  assert.equal(states.at(-1)?.connectionStatus, "error")
  assert.equal(states.at(-1)?.micEnabled, true)
  // The connection error cannot grant a new microphone-enable request.
  let enableCalls = 0
  room.localParticipant.setMicrophoneEnabled = async () => { enableCalls++ }
  await client.setMicrophoneEnabled(true)
  assert.equal(enableCalls, 0)
})

test("mute failure on reconnect disconnects instead of marking the room ready", async () => {
  const { room, client } = fixture()
  await client.connect({ livekitUrl: "url", token: "token" })
  let state = "idle"
  client.subscribe((snapshot) => { state = snapshot.connectionStatus })
  room.localParticipant.setMicrophoneEnabled = async () => { throw new Error("mute failed") }
  room.state = "reconnecting"; room.emit("signalReconnecting")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.state, "disconnected")
  assert.notEqual(state, "connected")
})

test("connection rejection and media-device error are observable", async () => {
  const { room, client } = fixture()
  let error: string | null = null
  client.subscribe((snapshot) => { error = snapshot.errorMessage })
  room.connect = async () => { throw new Error("offline") }
  await assert.rejects(client.connect({ livekitUrl: "url", token: "token" }), /offline/)
  assert.equal(error, "offline")
  room.emit("mediaDevicesError", new Error("permission"))
  assert.equal(error, "permission")
})

test("connect completing after disposal is disconnected again without publishing state", async () => {
  const { room, client } = fixture()
  let release!: () => void
  room.connect = async () => { await new Promise<void>((resolve) => { release = resolve }); room.state = "connected" }
  const connecting = client.connect({ livekitUrl: "url", token: "token" })
  const closing = client.disconnect()
  release(); await Promise.all([connecting, closing])
  assert.equal(room.state, "disconnected")
})

test("ownership cannot release while an earlier native connect is still unresolved", async () => {
  const registry = createMediaClientRegistry()
  const { room, client } = fixture()
  let release!: () => void, created = 0
  room.connect = async () => { await new Promise<void>((resolve) => { release = resolve }); room.state = "connected" }
  const first = await registry.acquire(() => { created++; return client })
  const connecting = first.connect({ livekitUrl: "url", token: "token" })
  const replacing = registry.acquire(() => { created++; return fixture().client })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(created, 1)
  release(); await connecting
  const second = await replacing
  assert.equal(room.state, "disconnected")
  await second.disconnect()
})

test("ownership cannot release while an earlier microphone enable is still unresolved", async () => {
  const registry = createMediaClientRegistry()
  const { room, client } = fixture()
  const first = await registry.acquire(() => client)
  await first.connect({ livekitUrl: "url", token: "token" })
  let release!: () => void, created = 0
  const original = room.localParticipant.setMicrophoneEnabled.bind(room.localParticipant)
  room.localParticipant.setMicrophoneEnabled = async (enabled) => {
    if (enabled) await new Promise<void>((resolve) => { release = resolve })
    await original(enabled)
  }
  const enabling = first.setMicrophoneEnabled(true)
  const replacing = registry.acquire(() => { created++; return fixture().client })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(created, 0)
  release(); await enabling
  const second = await replacing
  assert.equal(room.localParticipant.isMicrophoneEnabled, false)
  await second.disconnect()
})
