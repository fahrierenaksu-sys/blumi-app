/**
 * Two phones in one MiniRoom, end to end (2026-10-01 owner report: "when the
 * partner moves, the other phone does not see it live").
 *
 * Each simulated phone runs the production client code: the real
 * RealtimeClient and globalRealtimeProvider (one instance per phone), the real
 * useMiniRoomMotion hook and motion session, the real scene store and the
 * real motion presentation, over a real WebSocket against the real server
 * stack (apps/server/src/e2e/socialLoopHarness.ts, in-memory storage). Only
 * React (the hook harness), the AppState source, the network store and the
 * UI-thread animator are test doubles; the animator walks in scaled real time.
 *
 * The test asserts what each person sees: the partner's walk starts within a
 * latency budget and ends exactly at the sender's target, both directions,
 * for floor taps and seat taps, after a socket reconnect and after one phone
 * backgrounds and returns.
 */
import assert from "node:assert/strict"
import Module from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import WebSocket from "ws"
import * as RealtimeClientModule from "@blumi/realtime-client"
import type { RealtimeSocket } from "@blumi/realtime-client"
import { createFakeReactRuntime, createInertModule, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ProviderModule from "../realtime/globalRealtimeProvider"
import type * as MotionHook from "./useMiniRoomMotion"
import type * as StoreModule from "./scene/miniRoomSceneStore"
import type * as PresentationModule from "./scene/useMiniRoomMotionPresentation"
import type { MiniRoomStore } from "./scene/miniRoomSceneTypes"
import type { ResolvedRoomV2Scene } from "../roomV2/roomV2.types"

// Room V2 catalogs require image files; Metro resolves them on the phone.
const extensions = (Module as unknown as {
  _extensions: Record<string, (module: { exports: unknown }, file: string) => void>
})._extensions
for (const extension of [".webp", ".png", ".jpg"]) {
  extensions[extension] ??= (module, file) => { module.exports = { uri: file } }
}

/** One partner step must reach the other phone within this (loopback, in memory). */
const PARTNER_STEP_BUDGET_MS = 500
/** The fake UI-thread animator walks this many times faster than the phone. */
const WALK_TIME_SCALE = 0.05

interface ServerHarness {
  wsUrl: string
  openRoom(inviter: unknown, invitee: unknown, threadId: string): Promise<{ miniRoomId: string }>
  close(): Promise<void>
}
interface SimSocket {
  received(type: string, since?: number): { event: { type: string } }[]
  send(type: string, payload: unknown): number
  barrier(): Promise<void>
  close(): Promise<number>
}
interface SimUser {
  connect(): Promise<SimSocket>
  userId: string
  name: string
  sessionToken: string
  clientAddress: string
  http(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>
}

const serverE2e = resolve(__dirname, "../../../../server/src/e2e")

async function startServer() {
  // Loaded at run time: the mobile typecheck never follows server sources.
  const harnessModule = await import(resolve(serverE2e, "socialLoopHarness.ts"))
  const scenarios = await import(resolve(serverE2e, "socialLoopScenarios.ts"))
  const harness = await harnessModule.startSocialLoop({ storage: "memory" }) as ServerHarness
  const pair = await scenarios.connectedMatchedPair({ harness, report: () => undefined }) as {
    ada: SimUser; bora: SimUser; threadId: string
    sa: { close(): Promise<number> }; sb: { close(): Promise<number> }
  }
  // The harness phones only set up the match; the simulated apps open their own sockets.
  await Promise.all([pair.sa.close(), pair.sb.close()])
  const room = await harness.openRoom(pair.ada, pair.bora, pair.threadId)
  return { harness, ada: pair.ada, bora: pair.bora, miniRoomId: room.miniRoomId }
}

function loadSharedRoomScene(): ResolvedRoomV2Scene {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const catalog = require("../roomV2/roomV2Catalog")
  const selectors = require("../roomV2/roomV2Selectors")
  /* eslint-enable @typescript-eslint/no-require-imports */
  return selectors.resolveRoomV2Scene({
    roomShellCatalog: catalog.ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: catalog.ROOM_V2_FURNITURE_CATALOG,
    decor: {
      schemaVersion: 3, geometryVersion: "room_v2", roomShellId: catalog.DEFAULT_ROOM_V2_SHELL_ID,
      placedItems: [{ instanceId: "chair_left", itemId: "room_v2_chair_blush", x: 0.3, y: 0.62, rotation: "front" }]
    },
    defaultRoomShellId: catalog.DEFAULT_ROOM_V2_SHELL_ID
  })
}

interface FakePosition {
  x: { value: number }
  y: { value: number }
  walk?: { from: { x: number; y: number }; to: { x: number; y: number }; startedAt: number; durationMs: number }
}

/** The UI-thread animator, in scaled real time; a read mid-walk interpolates. */
const fakeAvatarPositions = {
  createMiniRoomAvatarPosition: (point: { x: number; y: number }): FakePosition =>
    ({ x: { value: point.x }, y: { value: point.y } }),
  readMiniRoomAvatarPosition: (position: FakePosition) => {
    const walk = position.walk
    if (!walk) return { x: position.x.value, y: position.y.value }
    const progress = Math.min(1, (Date.now() - walk.startedAt) / Math.max(1, walk.durationMs))
    return { x: walk.from.x + (walk.to.x - walk.from.x) * progress, y: walk.from.y + (walk.to.y - walk.from.y) * progress }
  },
  snapMiniRoomAvatarPosition: (position: FakePosition, point: { x: number; y: number }) => {
    position.walk = undefined
    position.x.value = point.x
    position.y.value = point.y
  },
  createMiniRoomSegmentAnimator: (position: FakePosition) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return {
      animate(segment: { from: { x: number; y: number }; to: { x: number; y: number }; durationMs: number }, onComplete: () => void) {
        if (timer) clearTimeout(timer)
        const durationMs = segment.durationMs * WALK_TIME_SCALE
        position.walk = { from: segment.from, to: segment.to, startedAt: Date.now(), durationMs }
        timer = setTimeout(() => {
          timer = undefined
          position.walk = undefined
          position.x.value = segment.to.x
          position.y.value = segment.to.y
          onComplete()
        }, durationMs)
      },
      cancel() {
        if (timer) clearTimeout(timer)
        timer = undefined
        if (position.walk) {
          const point = fakeAvatarPositions.readMiniRoomAvatarPosition(position)
          position.walk = undefined
          position.x.value = point.x
          position.y.value = point.y
        }
      }
    }
  }
}

interface PhoneView {
  motion: ReturnType<typeof MotionHook.useMiniRoomMotion>
  store: MiniRoomStore
  partnerPresent: boolean
}

/** One simulated app: its own socket, provider, hooks and scene. */
function createPhone(input: {
  harness: ServerHarness; me: SimUser; partner: SimUser; miniRoomId: string; roomDecorScene: ResolvedRoomV2Scene
  reduceMotion?: boolean
}) {
  const runtime = createFakeReactRuntime()
  const sockets: WebSocket[] = []
  const appState = { currentState: "active", listeners: new Set<(state: string) => void>() }
  const AppState = {
    get currentState() { return appState.currentState },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listeners.add(listener)
      return { remove: () => appState.listeners.delete(listener) }
    }
  }
  const createSocket = (url: string, protocols: string[]): RealtimeSocket => {
    const socket = new WebSocket(url, protocols, { headers: { "x-forwarded-for": input.me.clientAddress } })
    socket.on("error", () => undefined)
    sockets.push(socket)
    return socket as unknown as RealtimeSocket
  }
  class PhoneRealtimeClient extends RealtimeClientModule.RealtimeClient {
    constructor(wsBaseUrl: string, ticketProvider: RealtimeClientModule.RealtimeTicketProvider) {
      super(wsBaseUrl, ticketProvider, { createSocket, onDroppedEvent: (drop) => drops.push(drop) })
    }
  }
  const drops: RealtimeClientModule.RealtimeEventDrop[] = []
  const provider = loadSourceWithFakeReact<typeof ProviderModule>("features/realtime/globalRealtimeProvider.ts", runtime, {
    modules: {
      "@blumi/realtime-client": { ...RealtimeClientModule, RealtimeClient: PhoneRealtimeClient },
      "../network/networkStore": { getIsConnected: () => true, subscribeToNetworkStatus: () => () => undefined },
      "./realtimeTicketApi": {
        requestRealtimeTicket: async () => {
          const issued = await input.me.http("POST", "/v1/auth/realtime-ticket")
          assert.equal(issued.status, 201)
          return issued.body.ticket as string
        }
      }
    },
    real: ["./realtimeAppLifecycle"]
  })
  const motionHook = loadSourceWithFakeReact<typeof MotionHook>("features/miniRoom/useMiniRoomMotion.ts", runtime, {
    modules: { "react-native": { AppState }, "../realtime/globalRealtimeProvider": provider },
    real: ["./miniRoomMotionSession"]
  })
  const { cozyPinkBedroomScene } = loadSourceWithFakeReact<{ cozyPinkBedroomScene: unknown }>(
    "features/miniRoom/scene/roomMaps.ts", runtime,
    { modules: { "./miniRoomAssets": { miniRoomAssets: createInertModule("miniRoomAssets") } } }
  )
  const storeModule = loadSourceWithFakeReact<typeof StoreModule>("features/miniRoom/scene/miniRoomSceneStore.ts", runtime, {
    modules: {
      "./roomMaps": { cozyPinkBedroomScene },
      "../miniRoomAvatarMotion": { canMiniRoomAvatarUseMotion: () => true },
      "./miniRoomAvatarPositions": fakeAvatarPositions
    },
    real: [
      "./miniRoomInitialAvatars",
      "../../roomWorld/roomWorldGeometry",
      "../../roomWorld/roomWorldRoomV2Projection",
      "../../roomWorld/roomWorldMiniRoomProjection",
      "../../roomWorld/roomWorldRuntime",
      "./miniRoomMovementLifecycle",
      "./miniRoomMovementRun",
      "./miniRoomSpeechStack",
      "./miniRoomSeatRefusalModel",
      "./miniRoomEntryModel"
    ]
  })
  const presentation = loadSourceWithFakeReact<typeof PresentationModule>(
    "features/miniRoom/scene/useMiniRoomMotionPresentation.ts", runtime,
    { real: ["./miniRoomMotionPresentationModel"] }
  )
  const localUser = { userId: input.me.userId, displayName: input.me.name }
  const partnerUser = { userId: input.partner.userId, displayName: input.partner.name }
  const participantAvatarSnapshots = {
    local: { displayName: input.me.name, appearance: {} },
    partner: { displayName: input.partner.name, appearance: {} }
  } as never
  let isFocused = true
  // MiniRoomScreen -> MiniRoomScene, reduced to the motion path.
  const render = () => runtime.render((): PhoneView => {
    const motion = motionHook.useMiniRoomMotion({
      miniRoomId: input.miniRoomId, localUserId: input.me.userId, partnerUserId: input.partner.userId,
      enabled: true, isFocused
    })
    const store = storeModule.useMiniRoomSceneStore({
      localUser, partnerUser, participantAvatarSnapshots,
      onLocalMove: motion.onLocalMove, onSeatTaken: motion.reportSeatTaken,
      roomDecorScene: input.roomDecorScene, bubbleLifetimeMs: 4000
    })
    const partnerPresent = presentation.useMiniRoomMotionPresentation(motion, store, localUser.userId, partnerUser.userId,
      input.reduceMotion ?? false)
    return { motion, store, partnerPresent }
  })
  const view = () => runtime.output as PhoneView
  return {
    name: input.me.name,
    userId: input.me.userId,
    provider,
    drops,
    view,
    open() {
      provider.connectGlobal(input.harness.wsUrl, "http://unused", input.me.sessionToken)
      render()
    },
    /** As the app shell and the hook both hear it (useGlobalRealtimeSession first). */
    setAppState(state: string) {
      appState.currentState = state
      provider.setGlobalRealtimeAppState(state)
      for (const listener of [...appState.listeners]) listener(state)
    },
    /** The network drops the socket; the client reconnects on its own. */
    dropSocket() {
      const live = sockets.filter((socket) => socket.readyState === WebSocket.OPEN)
      assert.ok(live.length > 0, `${input.me.name} has an open socket to drop`)
      for (const socket of live) socket.terminate()
    },
    setFocused(next: boolean) { isFocused = next; runtime.rerender() },
    close() {
      runtime.unmount()
      provider.disconnectGlobal()
      for (const socket of sockets) socket.terminate()
    }
  }
}

type Phone = ReturnType<typeof createPhone>

async function waitUntil<T>(label: string, find: () => T | undefined | false, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = find()
    if (found !== undefined && found !== false) return found
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`)
    await new Promise((done) => setTimeout(done, 2))
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

/** The phone shows `userId` present and standing or sitting still. */
function settledAvatar(phone: Phone, userId: string) {
  const avatar = phone.view().store.avatars[userId]
  return avatar && avatar.present !== false && avatar.motion !== "walking" && avatar.targetX === undefined
    ? avatar : undefined
}

async function bothInScene(a: Phone, b: Phone) {
  await waitUntil(`${a.name} sees ${b.name} present`, () => a.view().partnerPresent && a.view().motion.avatars.length === 2)
  await waitUntil(`${b.name} sees ${a.name} present`, () => b.view().partnerPresent && b.view().motion.avatars.length === 2)
}

/**
 * `mover` taps; `watcher` must see the partner start walking to the same
 * target within the budget and end exactly there.
 */
async function assertPartnerSeesWalk(mover: Phone, watcher: Phone, tap: { x: number; y: number } | { hotspotId: string }) {
  await waitUntil(`${mover.name} settled before the tap`, () => settledAvatar(mover, mover.userId))
  const tappedAt = Date.now()
  const accepted = "hotspotId" in tap
    ? mover.view().store.moveLocalAvatarToHotspot(tap.hotspotId)
    : mover.view().store.moveLocalAvatar(tap)
  assert.equal(accepted, true, `${mover.name}'s phone accepts the tap`)
  const local = mover.view().store.avatars[mover.userId]
  assert.equal(local.motion, "walking", `${mover.name}'s own avatar walks at once`)
  const target = { x: local.targetX!, y: local.targetY! }
  const started = await waitUntil(`${watcher.name} sees ${mover.name} start walking`, () => {
    const partner = watcher.view().store.avatars[mover.userId]
    return partner?.motion === "walking" && partner.targetX !== undefined &&
      near(partner.targetX, target.x) && near(partner.targetY!, target.y) ? Date.now() : undefined
  }, PARTNER_STEP_BUDGET_MS + 1_000)
  const latency = started - tappedAt
  assert.ok(latency <= PARTNER_STEP_BUDGET_MS, `${watcher.name} saw ${mover.name}'s walk after ${latency} ms`)
  const [moverEnd, watcherEnd] = await Promise.all([
    waitUntil(`${mover.name} arrives`, () => settledAvatar(mover, mover.userId)),
    waitUntil(`${watcher.name} sees ${mover.name} arrive`, () => settledAvatar(watcher, mover.userId))
  ])
  assert.deepEqual({ x: watcherEnd.x, y: watcherEnd.y, seated: watcherEnd.seatedHotspotId },
    { x: moverEnd.x, y: moverEnd.y, seated: moverEnd.seatedHotspotId },
    `${watcher.name} shows ${mover.name} exactly where ${mover.name}'s phone does`)
  return latency
}

test("two phones see each other's MiniRoom walks live, both directions, across reconnect and background", async (t) => {
  const { harness, ada, bora, miniRoomId } = await startServer()
  const roomDecorScene = loadSharedRoomScene()
  const seat = loadSeatHotspotId(roomDecorScene)
  const phoneA = createPhone({ harness, me: ada, partner: bora, miniRoomId, roomDecorScene })
  const phoneB = createPhone({ harness, me: bora, partner: ada, miniRoomId, roomDecorScene })
  t.after(async () => {
    phoneA.close()
    phoneB.close()
    await harness.close()
  })
  phoneA.open()
  phoneB.open()
  await bothInScene(phoneA, phoneB)

  await t.test("floor taps, both directions", async () => {
    await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.62, y: 0.78 })
    await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.4, y: 0.82 })
  })

  await t.test("a seat tap walks the partner onto the same seat", async () => {
    await assertPartnerSeesWalk(phoneA, phoneB, { hotspotId: seat })
    await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.55, y: 0.74 })
  })

  await t.test("retargeting during a walk ends at the newest target on both phones", async () => {
    await waitUntil("A settled", () => settledAvatar(phoneA, phoneA.userId))
    assert.equal(phoneA.view().store.moveLocalAvatar({ x: 0.7, y: 0.7 }), true)
    await new Promise((done) => setTimeout(done, 30))
    assert.equal(phoneA.view().store.moveLocalAvatar({ x: 0.45, y: 0.8 }), true)
    const target = phoneA.view().store.avatars[phoneA.userId]
    const [moverEnd, watcherEnd] = await Promise.all([
      waitUntil("A arrives", () => settledAvatar(phoneA, phoneA.userId)),
      waitUntil("B sees A arrive at the newest target", () => {
        const avatar = settledAvatar(phoneB, phoneA.userId)
        return avatar && near(avatar.x, target.targetX!) && near(avatar.y, target.targetY!) ? avatar : undefined
      })
    ])
    assert.deepEqual({ x: watcherEnd.x, y: watcherEnd.y }, { x: moverEnd.x, y: moverEnd.y })
  })

  await t.test("a burst of taps ends at the last tap on both phones", async () => {
    await waitUntil("B settled", () => settledAvatar(phoneB, phoneB.userId))
    let last = { targetX: undefined as number | undefined, targetY: undefined as number | undefined }
    for (const x of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
      await new Promise((done) => setTimeout(done, 15))
      assert.equal(phoneB.view().store.moveLocalAvatar({ x, y: 0.74 }), true)
      const avatar = phoneB.view().store.avatars[phoneB.userId]
      last = { targetX: avatar.targetX, targetY: avatar.targetY }
    }
    const [moverEnd, watcherEnd] = await Promise.all([
      waitUntil("B arrives", () => settledAvatar(phoneB, phoneB.userId)),
      waitUntil("A sees B arrive at the last tap", () => {
        const avatar = settledAvatar(phoneA, phoneB.userId)
        return avatar && near(avatar.x, last.targetX!) && near(avatar.y, last.targetY!) ? avatar : undefined
      })
    ])
    assert.deepEqual({ x: watcherEnd.x, y: watcherEnd.y }, { x: moverEnd.x, y: moverEnd.y })
  })

  await t.test("both phones tap the same seat at once: one sits, both phones agree", async () => {
    await waitUntil("A settled", () => settledAvatar(phoneA, phoneA.userId))
    await waitUntil("B settled", () => settledAvatar(phoneB, phoneB.userId))
    phoneA.view().store.moveLocalAvatarToHotspot(seat)
    phoneB.view().store.moveLocalAvatarToHotspot(seat)
    const settled = async (phone: Phone) => Promise.all([phoneA, phoneB].map((who) =>
      waitUntil(`${phone.name} shows ${who.name} settled`, () => settledAvatar(phone, who.userId))))
    await new Promise((done) => setTimeout(done, 300))
    const [onA, onB] = [await settled(phoneA), await settled(phoneB)]
    const pose = (avatars: { x: number; y: number; seatedHotspotId?: string }[]) =>
      avatars.map(({ x, y, seatedHotspotId }) => ({ x, y, seatedHotspotId }))
    assert.deepEqual(pose(onB), pose(onA), "both phones show the same two poses")
    assert.equal(pose(onA).filter((avatar) => avatar.seatedHotspotId === seat).length, 1, "exactly one sits")
    // Leave the seat so later steps start standing.
    for (const phone of [phoneA, phoneB]) {
      if (settledAvatar(phone, phone.userId)?.seatedHotspotId === seat) {
        await assertPartnerSeesWalk(phone, phone === phoneA ? phoneB : phoneA, { x: 0.55, y: 0.8 })
      }
    }
  })

  await t.test("after a dropped socket reconnects", async () => {
    phoneA.dropSocket()
    await waitUntil("A notices the drop", () => phoneA.provider.getGlobalStatus() !== "connected")
    await waitUntil("A reconnects", () => phoneA.provider.getGlobalStatus() === "connected" &&
      phoneA.view().motion.avatars.length === 2, 10_000)
    await bothInScene(phoneA, phoneB)
    await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.6, y: 0.8 })
    await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.5, y: 0.7 })
  })

  await t.test("after one phone backgrounds and returns", async () => {
    phoneB.setAppState("background")
    await waitUntil("A sees B leave", () => !phoneA.view().partnerPresent)
    phoneB.setAppState("active")
    await bothInScene(phoneA, phoneB)
    await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.65, y: 0.76 })
    await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.42, y: 0.76 })
  })

  await t.test("after the room screen loses and regains focus", async () => {
    phoneA.setFocused(false)
    await waitUntil("B sees A leave", () => !phoneB.view().partnerPresent)
    phoneA.setFocused(true)
    await bothInScene(phoneA, phoneB)
    await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.58, y: 0.72 })
    await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.48, y: 0.84 })
  })

  assert.deepEqual([...phoneA.drops, ...phoneB.drops].filter((drop) => drop.reason !== "unknown_type"), [],
    "no motion event was dropped as invalid")
})

test("a partner on an app without motion sync (TestFlight build 14) never enters the scene: no live walk either way", async (t) => {
  const { harness, ada, bora, miniRoomId } = await startServer()
  const roomDecorScene = loadSharedRoomScene()
  const phoneA = createPhone({ harness, me: ada, partner: bora, miniRoomId, roomDecorScene })
  // Build 14 (9982882) opens the room and its socket but has no mini_room.scene_enter or mini_room.move.
  const oldPhone = await bora.connect()
  t.after(async () => {
    phoneA.close()
    await oldPhone.close()
    await harness.close()
  })
  phoneA.open()
  await waitUntil("A joins the scene", () => phoneA.view().motion.avatars.length === 2)
  assert.equal(phoneA.view().partnerPresent, false, "the new app shows the old app's partner as not in the room")
  await waitUntil("A settled", () => settledAvatar(phoneA, phoneA.userId))
  assert.equal(phoneA.view().store.moveLocalAvatar({ x: 0.62, y: 0.78 }), true)
  await waitUntil("A arrives", () => settledAvatar(phoneA, phoneA.userId))
  await oldPhone.barrier()
  assert.deepEqual(oldPhone.received("mini_room.avatar_moved"), [], "the server sends motion only to sockets in the scene")
  assert.deepEqual(oldPhone.received("mini_room.motion_snapshot"), [])
})

test("a late scene entry from the phone's own abandoned socket never takes the room away from it", async (t) => {
  const { harness, ada, bora, miniRoomId } = await startServer()
  const roomDecorScene = loadSharedRoomScene()
  // Ada's phone had a socket before this one (same sign-in session); its
  // entry, held up by a slow check, reaches the server after the reconnect.
  const abandoned = await ada.connect()
  const phoneA = createPhone({ harness, me: ada, partner: bora, miniRoomId, roomDecorScene })
  const phoneB = createPhone({ harness, me: bora, partner: ada, miniRoomId, roomDecorScene })
  t.after(async () => {
    phoneA.close()
    phoneB.close()
    await abandoned.close()
    await harness.close()
  })
  phoneA.open()
  phoneB.open()
  await bothInScene(phoneA, phoneB)
  abandoned.send("mini_room.scene_enter", { miniRoomId })
  await abandoned.barrier()
  await new Promise((done) => setTimeout(done, 50))
  assert.notEqual(phoneA.view().motion.superseded, true, "Ada's phone is not told another device took over")
  await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.6, y: 0.8 })
  await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.45, y: 0.75 })
})

test("a partner who comes in later walks in from the door to where the server put them; their steps still win", async (t) => {
  const { harness, ada, bora, miniRoomId } = await startServer()
  const roomDecorScene = loadSharedRoomScene()
  const entry = roomDecorScene.shell?.entry
  assert.ok(entry, "the shared room shell has a door")
  const phoneA = createPhone({ harness, me: ada, partner: bora, miniRoomId, roomDecorScene })
  const phoneB = createPhone({ harness, me: bora, partner: ada, miniRoomId, roomDecorScene })
  t.after(async () => {
    phoneA.close()
    phoneB.close()
    await harness.close()
  })
  phoneA.open()
  await waitUntil("A is in the scene", () => phoneA.view().motion.avatars.some((avatar) => avatar.userId === ada.userId))
  phoneB.open()
  const entering = await waitUntil("A shows B walking in from the door", () => {
    const partner = phoneA.view().store.avatars[bora.userId]
    return partner?.enteringFromDoor && partner.motion === "walking" ? partner : undefined
  })
  assert.ok(entering.arrivalId !== undefined, "the arrival fades in")
  const record = phoneA.view().motion.avatars.find((avatar) => avatar.userId === bora.userId)!
  assert.deepEqual({ x: entering.targetX, y: entering.targetY }, { x: record.x, y: record.y },
    "the walk ends at the server's position")
  assert.equal(phoneA.view().store.deferUntilArrivalLands(bora.userId, () => undefined), true)
  const [onA, onB] = await Promise.all([
    waitUntil("A shows B arrived", () => settledAvatar(phoneA, bora.userId)),
    waitUntil("B is settled", () => settledAvatar(phoneB, bora.userId))
  ])
  assert.deepEqual({ x: onA.x, y: onA.y }, { x: onB.x, y: onB.y }, "both phones show B at the same spot")
  assert.equal(onA.enteringFromDoor, undefined)
  // B's next step takes over at once, from wherever B is.
  await assertPartnerSeesWalk(phoneB, phoneA, { x: 0.6, y: 0.78 })
  await assertPartnerSeesWalk(phoneA, phoneB, { x: 0.45, y: 0.8 })
})

test("under Reduce Motion a later partner fades in at the server's position, without a walk", async (t) => {
  const { harness, ada, bora, miniRoomId } = await startServer()
  const roomDecorScene = loadSharedRoomScene()
  const phoneA = createPhone({ harness, me: ada, partner: bora, miniRoomId, roomDecorScene, reduceMotion: true })
  const phoneB = createPhone({ harness, me: bora, partner: ada, miniRoomId, roomDecorScene })
  t.after(async () => {
    phoneA.close()
    phoneB.close()
    await harness.close()
  })
  phoneA.open()
  await waitUntil("A is in the scene", () => phoneA.view().motion.avatars.some((avatar) => avatar.userId === ada.userId))
  phoneB.open()
  const arrived = await waitUntil("A shows B arrived", () => {
    const partner = phoneA.view().store.avatars[bora.userId]
    return partner?.arrivalId !== undefined && partner.present !== false ? partner : undefined
  })
  assert.notEqual(arrived.motion, "walking")
  assert.equal(arrived.enteringFromDoor, undefined)
  const onB = await waitUntil("B is settled", () => settledAvatar(phoneB, bora.userId))
  assert.deepEqual({ x: arrived.x, y: arrived.y }, { x: onB.x, y: onB.y })
})

function loadSeatHotspotId(scene: ResolvedRoomV2Scene): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const projection = require("../roomWorld/roomWorldRoomV2Projection")
  const seats = projection.createRoomWorldHotspotsFromRoomV2Scene(scene) as { id: string; kind: string }[]
  const seat = seats.find((hotspot) => hotspot.kind === "seat")
  assert.ok(seat, "the shared room has a seat")
  return seat.id
}
