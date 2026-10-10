/**
 * MiniRoom on layered furniture (2.5D room calibration): two sitters on the one sofa, each on her own
 * seat and drawn between the sofa's back and front layers far to near; the armchair keeps working; a tap above a
 * back wall drops onto the floor. Plain Node runs the release bundle's stub, so the calibration is built here from
 * the Workbench files and handed to the code under test.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReanimatedStub, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { MiniRoomAvatarMotion } from "@blumi/contracts"
import type { LayeredFurnitureAssets } from "../../roomV2/furniture/layeredFurniture"
import type { ResolvedRoomV2Scene, RoomV2FurnitureRenderItem } from "../../roomV2/roomV2.types"
import type { AvatarState, MiniRoomStore } from "./miniRoomSceneTypes"
import type { useMiniRoomSceneStore as UseMiniRoomSceneStore } from "./miniRoomSceneStore"
import {
  chooseMiniRoomSeatFromTap,
  createMiniRoomLayeredSeats,
  createMiniRoomOccupants,
  getMiniRoomAvatarLayeredSeat,
  isMiniRoomLayeredSeatTaken,
  MINI_ROOM_LAYERED_SITTER_RADIUS,
  resolveMiniRoomAvatar25dSeatPlacement,
  resolveMiniRoomFigureZIndices
} from "./miniRoomLayeredSeats"

// The room catalog bundles image modules: in plain Node they load as their file names.
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- loaded after the image hooks above */
const catalog = require("../../roomV2/roomV2Catalog") as typeof import("../../roomV2/roomV2Catalog")
const selectors = require("../../roomV2/roomV2Selectors") as typeof import("../../roomV2/roomV2Selectors")
const projection = require("../../roomWorld/roomWorldRoomV2Projection") as
  typeof import("../../roomWorld/roomWorldRoomV2Projection")
const runtimeModule = require("../../roomWorld/roomWorldRuntime") as typeof import("../../roomWorld/roomWorldRuntime")
const depthModel = require("./miniRoomDepthModel") as typeof import("./miniRoomDepthModel")
const calibrationModule = require("../../roomV2/calibration/roomAvatar25dRoomCalibration") as
  typeof import("../../roomV2/calibration/roomAvatar25dRoomCalibration")
const calibrationScene = require("../../roomV2/calibration/roomCalibrationScene") as
  typeof import("../../roomV2/calibration/roomCalibrationScene")
const layeredCatalog = require("../../roomV2/furniture/layeredFurnitureCatalog") as
  typeof import("../../roomV2/furniture/layeredFurnitureCatalog")
const testRoom = require("../../roomV2/furniture/layeredFurnitureTestRoom") as
  typeof import("../../roomV2/furniture/layeredFurnitureTestRoom")
/* eslint-enable @typescript-eslint/no-require-imports */

const asset = (key: string) => ({ key, source: 0 as never })
const layers = (id: string) => Object.fromEntries(([0, 1, 2, 3] as const).map((r) => [r, {
  back: asset(`${id}_r${r}_back`), front: asset(`${id}_r${r}_front`), shadow: asset(`${id}_r${r}_shadow`)
}])) as unknown as LayeredFurnitureAssets[string]
const SOFA_ID = layeredCatalog.ROOM_AVATAR_25D_SOFA_ID
const ASSETS: LayeredFurnitureAssets = { room_v2_chair_blush: layers("room_v2_chair_blush"), [SOFA_ID]: layers(SOFA_ID) }
const CALIBRATION = createCalibration()

function createCalibration() {
  return calibrationModule.createRoomAvatar25dRoomCalibration(ASSETS)
}

/** A furnished room (the pink armchair mid-floor, the sofa by the left wall) as the calibrated room resolves it. */
function createDemoScene(): ResolvedRoomV2Scene {
  const plain = selectors.resolveRoomV2Scene({
    roomShellCatalog: catalog.ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: [...catalog.ROOM_V2_FURNITURE_CATALOG, ...layeredCatalog.createRoomAvatar25dFurnitureCatalog(ASSETS)],
    decor: { schemaVersion: 3, geometryVersion: "room_v2", ...testRoom.createLayeredFurnitureTestRoom() },
    defaultRoomShellId: catalog.DEFAULT_ROOM_V2_SHELL_ID
  })
  return {
    ...plain,
    shell: plain.shell ? CALIBRATION.calibrateShell(plain.shell) : plain.shell,
    renderItems: plain.renderItems.map((item) => item.kind === "furniture" ? CALIBRATION.calibrateFurnitureItem(item) : item)
  }
}

const SCENE = createDemoScene()
const SOFA = SCENE.renderItems.find((item) => item.kind === "furniture" && item.itemId === SOFA_ID) as RoomV2FurnitureRenderItem
const CHAIR = SCENE.renderItems.find((item) => item.kind === "furniture" && item.itemId === "room_v2_chair_blush") as
  RoomV2FurnitureRenderItem
const SEATS = createMiniRoomLayeredSeats(SCENE)
const S0 = `${SOFA.renderId}:s0`
const S1 = `${SOFA.renderId}:s1`
const CHAIR_SEAT = Object.keys(SEATS).find((id) => id.startsWith(`${CHAIR.renderId}:`))!

function avatar(userId: string, patch: Partial<AvatarState> = {}): AvatarState {
  return { userId, displayName: userId, x: 0.5, y: 0.8, facing: "front", motion: "idle", appearance: {} as AvatarState["appearance"], ...patch }
}

/** Seated on a layered seat as both phones show it: on its approach spot, drawn sitting. */
function seatedOn(userId: string, hotspotId: string): AvatarState {
  const seat = SEATS[hotspotId]!
  return avatar(userId, { ...seat.approach, motion: "sitting", seatedHotspotId: hotspotId })
}

test("the sofa's two seats and the armchair's one are layered seats, named exactly as the shared hotspots", () => {
  const hotspotIds = projection.createRoomWorldHotspotsFromRoomV2Scene(SCENE).map((hotspot) => hotspot.id).sort()
  assert.deepEqual(Object.keys(SEATS).sort(), hotspotIds)
  assert.deepEqual([S0, S1].map((id) => SEATS[id]?.piece.renderId), [SOFA.renderId, SOFA.renderId])
  assert.equal(SEATS[CHAIR_SEAT]!.piece.renderId, CHAIR.renderId)
  // the sofa's sitters draw far to near; the chair's one sitter has rank 0
  assert.deepEqual([SEATS[S0]!.drawRank, SEATS[S1]!.drawRank].sort(), [0, 1])
  assert.equal(SEATS[CHAIR_SEAT]!.drawRank, 0)
  // flag off (no calibration): no piece is layered, so MiniRoom keeps its shipped seats
  const plain = selectors.resolveRoomV2Scene({
    roomShellCatalog: catalog.ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: catalog.ROOM_V2_FURNITURE_CATALOG,
    decor: { schemaVersion: 3, geometryVersion: "room_v2", roomShellId: catalog.DEFAULT_ROOM_V2_SHELL_ID,
      placedItems: [{ instanceId: "chair", itemId: "room_v2_chair_blush", x: 0.479, y: 0.693, rotation: "front" }] },
    defaultRoomShellId: catalog.DEFAULT_ROOM_V2_SHELL_ID
  })
  assert.deepEqual(createMiniRoomLayeredSeats(plain), {})
  assert.deepEqual(depthModel.createMiniRoomDepthScene(plain).layeredSeats, {})
})

test("one sitter on the sofa leaves its other seat free and reachable; the seat itself is held by hotspot", () => {
  const geometry = calibrationScene.calibrateRoomWalkGeometry(projection.createRoomWorldGeometryFromRoomV2Scene(SCENE), SCENE.shell)
  const partner = seatedOn("partner", S0)
  const me = avatar("me", { x: 0.6, y: 0.85 })
  const avatars = { partner, me }
  const planTo = (occupants: ReturnType<typeof createMiniRoomOccupants>) => runtimeModule.createRoomWorldMovementPlan({
    geometry, from: me, to: SEATS[S1]!.approach, clearance: runtimeModule.ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
    timing: runtimeModule.ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING, occupants, movingOccupantId: "me"
  })
  const occupants = createMiniRoomOccupants(avatars, SEATS)
  assert.equal(occupants.find((occupant) => occupant.id === "partner")!.radius, MINI_ROOM_LAYERED_SITTER_RADIUS)
  assert.ok(planTo(occupants), "the free seat's approach spot is reachable beside a sitter")
  // the same spot with a standing partner keeps a standing avatar's personal space: the sofa's seats are closer
  // together than that, which is why a sitter needs the smaller radius
  assert.equal(planTo(createMiniRoomOccupants({ partner: { ...partner, motion: "idle", seatedHotspotId: undefined }, me }, SEATS)), null)
  // held by hotspot, not by distance
  assert.equal(isMiniRoomLayeredSeatTaken(SEATS[S0]!, avatars, "me"), true)
  assert.equal(isMiniRoomLayeredSeatTaken(SEATS[S1]!, avatars, "me"), false)
  assert.equal(isMiniRoomLayeredSeatTaken(SEATS[S0]!, avatars, "partner"), false, "her own seat is not taken from her")
  assert.equal(isMiniRoomLayeredSeatTaken(SEATS[S0]!, { ...avatars, partner: { ...partner, present: false } }, "me"), false)
  // walking to sit holds it too
  const walking = avatar("partner", { motion: "walking", targetX: SEATS[S1]!.approach.x, targetY: SEATS[S1]!.approach.y })
  assert.equal(isMiniRoomLayeredSeatTaken(SEATS[S1]!, { partner: walking, me }, "me"), true)
  // a tap on the sofa means the nearest seat nobody else holds
  assert.equal(chooseMiniRoomSeatFromTap([S0, S1], avatars, "me"), S1)
  assert.equal(chooseMiniRoomSeatFromTap([S1, S0], avatars, "me"), S1)
  assert.equal(chooseMiniRoomSeatFromTap([S0, S1], { partner, cem: seatedOn("cem", S1), me }, "me"), S0,
    "all held by others: the nearest (the store then says it is taken)")
  assert.equal(chooseMiniRoomSeatFromTap([S0, S1], { partner, me: seatedOn("me", S1) }, "me"), S1, "her own seat is hers")
})

test("two sitters on one sofa draw far to near, each right under her own front layer, above the sofa's back layer", () => {
  const depth = depthModel.createMiniRoomDepthScene(SCENE)
  const sofaIndex = depth.occluders.findIndex((item) => item.renderId === SOFA.renderId)
  const chairIndex = depth.occluders.findIndex((item) => item.renderId === CHAIR.renderId)
  assert.ok(sofaIndex >= 0 && chairIndex >= 0, "both pieces are drawn among the avatars")
  const ada = seatedOn("ada", S0)
  const bora = seatedOn("bora", S1)
  // seated avatars sort at their seat's depth (AvatarLayer pins it from seatedHotspotId)
  const order = depthModel.resolveMiniRoomDepthOrder(depth.neighbours, [ada, bora].map((sitter) => ({
    id: sitter.userId,
    depth: depthModel.resolveMiniRoomAvatarSortDepth(sitter.y, depth.seatDepthByHotspotId[sitter.seatedHotspotId!])
  })))
  const z = resolveMiniRoomFigureZIndices(depthModel.resolveMiniRoomDepthZIndices(order, depth.occluders.length),
    [ada, bora].filter((sitter) => getMiniRoomAvatarLayeredSeat(sitter, SEATS)).map((sitter) => sitter.userId))
  const [far, near] = SEATS[S0]!.drawRank === 0 ? ["ada", "bora"] : ["bora", "ada"]
  const stack = [
    z.occluders[sofaIndex]!, z.avatars[far]!, z.fronts[far]!, z.avatars[near]!, z.fronts[near]!
  ]
  assert.deepEqual([...stack].sort((a, b) => a - b), stack,
    `sofa back < far sitter < her front < near sitter < his front: ${JSON.stringify(stack)}`)
  // the armchair stands in front of the sofa: its back layer covers both sitters and their front layers
  assert.ok(z.occluders[chairIndex]! > z.fronts[near]!)
})

test("the armchair still seats one: her front layer is right above her and below the next piece", () => {
  const depth = depthModel.createMiniRoomDepthScene(SCENE)
  const sitter = seatedOn("ada", CHAIR_SEAT)
  const walker = avatar("bora", { x: 0.7, y: 0.9 })
  const order = depthModel.resolveMiniRoomDepthOrder(depth.neighbours, [
    { id: "ada", depth: depth.seatDepthByHotspotId[CHAIR_SEAT]! },
    { id: "bora", depth: walker.y, foot: { x: walker.x, y: walker.y } }
  ])
  const z = resolveMiniRoomFigureZIndices(depthModel.resolveMiniRoomDepthZIndices(order, depth.occluders.length), ["ada"])
  const chairIndex = depth.occluders.findIndex((item) => item.renderId === CHAIR.renderId)
  assert.ok(z.occluders[chairIndex]! < z.avatars.ada! && z.avatars.ada! < z.fronts.ada!)
  assert.ok(z.fronts.ada! < z.avatars.bora!, "someone standing in front of the chair is drawn over it all")
  assert.equal(z.fronts.bora, undefined, "only a sitter gets a front layer")
  assert.equal(getMiniRoomAvatarLayeredSeat({ ...sitter, motion: "idle" }, SEATS), undefined, "drawn sitting only")
  // her seated drawing: the chair's seat names its drawing, hip height and her spot relative to the seat point
  const placement = resolveMiniRoomAvatar25dSeatPlacement({ avatar: sitter, seat: SEATS[CHAIR_SEAT], stageWidthPx: 1254, stageHeightPx: 714 })
  const seat = SEATS[CHAIR_SEAT]!
  assert.equal(placement.outerPx, 0)
  assert.ok(Math.abs(placement.seatPx - seat.seatHeight * 714) < 1e-9 && placement.seatPx > 0)
  assert.deepEqual(placement.approachPx, { dx: (seat.approach.x - seat.seat.x) * 1254, dy: (seat.approach.y - seat.seat.y) * 714 })
  assert.equal(placement.hip?.view, seat.art.view)
  assert.deepEqual(resolveMiniRoomAvatar25dSeatPlacement({ avatar: sitter, seat: undefined, stageWidthPx: 1, stageHeightPx: 1 }),
    { outerPx: 0, seatPx: 0 })
})

// ---- the scene store, with the calibration a flagged bundle has ----

type StoreInput = Parameters<typeof UseMiniRoomSceneStore>[0]

function mountStore(scene: ResolvedRoomV2Scene) {
  const runtime = createFakeReactRuntime()
  const pending: { finish: () => void }[] = []
  const seatTaken: string[] = []
  const sent: { x: number; y: number; hotspotId?: string }[] = []
  const realProjection = projection
  const { useMiniRoomSceneStore } = loadSourceWithFakeReact<{ useMiniRoomSceneStore: typeof UseMiniRoomSceneStore }>(
    "features/miniRoom/scene/miniRoomSceneStore.ts", runtime, {
      modules: {
        "../../avatar/roomAvatarSeam": {
          roomAvatar25d: { enabled: true, roomCalibration: CALIBRATION, movementTiming: <T>(base: T) => base }
        },
        // the walk floor as the calibrated room has it
        "../../roomWorld/roomWorldRoomV2Projection": {
          ...realProjection,
          createRoomWorldGeometryFromRoomV2Scene: (input: ResolvedRoomV2Scene) =>
            calibrationScene.calibrateRoomWalkGeometry(realProjection.createRoomWorldGeometryFromRoomV2Scene(input), input.shell)
        },
        "./roomMaps": { cozyPinkBedroomScene: { hotspots: [], spawnPoints: [], furniture: [], map: { walkableAreas: [] } } },
        "../miniRoomAvatarMotion": { canMiniRoomAvatarUseMotion: () => true },
        "./miniRoomAvatarPositions": {
          createMiniRoomAvatarPosition: (point: { x: number; y: number }) => ({ x: { value: point.x }, y: { value: point.y } }),
          createMiniRoomPathAnimator: (position: { x: { value: number }; y: { value: number } }) => ({
            animate: (segments: readonly { from: { x: number; y: number }; to: { x: number; y: number } }[],
              onSegmentEnd: (index: number) => void) => {
              pending.length = 0
              position.x.value = segments[0]!.from.x
              position.y.value = segments[0]!.from.y
              segments.forEach((segment, index) => pending.push({ finish: () => {
                position.x.value = segment.to.x
                position.y.value = segment.to.y
                onSegmentEnd(index)
              } }))
            },
            cancel: () => { pending.length = 0 }
          }),
          readMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }) =>
            ({ x: position.x.value, y: position.y.value }),
          snapMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }, point: { x: number; y: number }) => {
            position.x.value = point.x
            position.y.value = point.y
          }
        }
      },
      real: [
        "./miniRoomInitialAvatars",
        "../../roomWorld/roomWorldGeometry",
        "../../roomWorld/roomWorldMiniRoomProjection",
        "../../roomWorld/roomWorldRuntime",
        "./miniRoomMovementLifecycle",
        "./miniRoomMovementRun",
        "./miniRoomSpeechStack",
        "./miniRoomSeatRefusalModel",
        "./miniRoomLayeredSeats",
        "./miniRoomEntryModel",
        "./miniRoomPresentation"
      ]
    }
  )
  const input = {
    localUser: { userId: "me", displayName: "Me" },
    partnerUser: { userId: "partner", displayName: "Partner" },
    participantAvatarSnapshots: { local: { displayName: "Me", appearance: {} }, partner: { displayName: "Partner", appearance: {} } },
    roomDecorScene: scene,
    onLocalMove: (point: { x: number; y: number }, hotspotId?: string) => { sent.push({ ...point, hotspotId }); return true },
    onSeatTaken: (hotspotId: string) => { seatTaken.push(hotspotId) },
    bubbleLifetimeMs: 4000
  } as unknown as StoreInput
  runtime.render(() => useMiniRoomSceneStore(input))
  const store = () => runtime.output as MiniRoomStore
  const settle = () => { for (let guard = 0; pending.length && guard < 50; guard += 1) pending.shift()!.finish() }
  return { runtime, store, settle, seatTaken, sent }
}

const record = (userId: string, patch: Partial<MiniRoomAvatarMotion>): MiniRoomAvatarMotion =>
  ({ userId, x: 0.5, y: 0.8, present: true, revision: 1, ...patch })

test("two people sit side by side on the sofa: each walks to her own seat's approach spot and sits from there", () => {
  const f = mountStore(SCENE)
  // the partner's phone claimed s0 and the server granted it: she is placed sitting on it
  f.store().applyRemoteAvatar(record("partner", { ...SEATS[S0]!.approach, hotspotId: S0 }), true)
  const partner = f.store().avatars.partner!
  assert.deepEqual({ x: partner.x, y: partner.y, seated: partner.seatedHotspotId, motion: partner.motion },
    { ...SEATS[S0]!.approach, seated: S0, motion: "sitting" })

  // a tap on her seat is refused on this phone (the server would refuse it too)
  assert.equal(f.store().moveLocalAvatarToHotspot(S0), false)
  assert.deepEqual(f.seatTaken, [S0])
  // a tap on the sofa nearest her seat takes the free one
  assert.equal(f.store().moveLocalAvatarToHotspot(S0, [S1]), true)
  assert.deepEqual(f.sent.at(-1), { ...SEATS[S1]!.approach, hotspotId: S1 }, "the claim names the seat; the target is on the floor")
  const walking = f.store().avatars.me!
  assert.equal(walking.motion, "walking")
  assert.equal(walking.depthSeatHotspotId, undefined, "the walk to the approach spot sorts by her feet")
  f.settle()
  const me = f.store().avatars.me!
  assert.deepEqual({ x: me.x, y: me.y, seated: me.seatedHotspotId, motion: me.motion },
    { ...SEATS[S1]!.approach, seated: S1, motion: "sitting" })
  assert.equal(f.store().avatars.partner!.seatedHotspotId, S0, "she keeps hers")

  // getting up is an ordinary walk from the approach spot (she was never inside the sofa's footprint)
  assert.equal(f.store().moveLocalAvatar({ x: 0.55, y: 0.85 }), true)
  assert.equal(f.store().avatars.me!.seatedHotspotId, undefined)
  assert.equal(f.store().avatars.me!.depthSeatHotspotId, undefined)
  f.settle()
  assert.equal(f.store().avatars.me!.motion, "idle")
  f.runtime.unmount()
})

test("the armchair still seats one in MiniRoom, and the server's grant of a seat this phone thought free wins", () => {
  const f = mountStore(SCENE)
  assert.equal(f.store().moveLocalAvatarToHotspot(CHAIR_SEAT), true)
  f.settle()
  const me = f.store().avatars.me!
  assert.deepEqual({ x: me.x, y: me.y, seated: me.seatedHotspotId, motion: me.motion },
    { ...SEATS[CHAIR_SEAT]!.approach, seated: CHAIR_SEAT, motion: "sitting" })
  // the partner's record walks her onto a sofa seat on this phone too, ending on its approach spot, sitting
  f.store().applyRemoteAvatar(record("partner", { ...SEATS[S1]!.approach, hotspotId: S1 }))
  f.settle()
  const partner = f.store().avatars.partner!
  assert.deepEqual({ x: partner.x, y: partner.y, seated: partner.seatedHotspotId, motion: partner.motion },
    { ...SEATS[S1]!.approach, seated: S1, motion: "sitting" })
  f.runtime.unmount()
})

test("a tap above a back wall walks to the floor straight below it, as in My Room", () => {
  const f = mountStore(SCENE)
  const wallTap = { x: 0.62, y: 0.3 }
  const expected = CALIBRATION.resolveTapTarget(wallTap, SCENE.shell)
  assert.ok(expected.y > wallTap.y + 0.1, `the wall tap drops onto the floor: ${JSON.stringify(expected)}`)
  assert.equal(f.store().moveLocalAvatar(wallTap), true)
  const target = f.sent.at(-1)!
  assert.ok(Math.hypot(target.x - expected.x, target.y - expected.y) < 0.02,
    `walks to ${JSON.stringify(target)}, below the tap at ${JSON.stringify(expected)}`)
  assert.equal(target.hotspotId, undefined)
  f.runtime.unmount()
})

// ---- what the avatar layer draws ----

test("the avatar layer draws a front layer over each sofa sitter, far to near, and none over anyone standing", () => {
  const runtime = createFakeReactRuntime()
  const { AvatarLayer } = loadSourceWithFakeReact<{ AvatarLayer: (props: unknown) => { props: { children: unknown } } }>(
    "features/miniRoom/scene/AvatarLayer.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": createReanimatedStub(runtime).module,
        "react-native-worklets": { scheduleOnRN: (callback: () => void) => callback() },
        "../../roomV2/components/RoomRenderer2D": { RoomRendererFurnitureSprite: "Sprite" },
        "../../roomV2/components/RoomRendererLayeredFurniture": { RoomRendererLayeredFurnitureFront: "Front" },
        "../../avatar/roomAvatarSeam": { roomAvatar25d: { enabled: false, roomCalibration: null } },
        "../../avatar/components/AvatarLive": { AvatarLive: "AvatarLive" },
        "./RoomSpeechBubbleStack": { RoomSpeechBubbleStack: "RoomSpeechBubbleStack" },
        "./RoomTypingBubble": { RoomTypingBubble: "RoomTypingBubble" }
      },
      real: ["./miniRoomLayeredSeats", "./miniRoomDepthModel", "./miniRoomSpeechStack", "./miniRoomReducedMotion",
        "./miniRoomPresentation", "./miniRoomAvatarStageModel"],
      inertUnknown: true
    }
  )
  const depthScene = depthModel.createMiniRoomDepthScene(SCENE)
  const avatars = { ada: seatedOn("ada", S0), bora: seatedOn("bora", S1), cem: avatar("cem", { x: 0.7, y: 0.9 }) }
  const position = (sitter: AvatarState) => ({ x: { value: sitter.x }, y: { value: sitter.y } })
  const drawn = runtime.render(() => {
    const layer = AvatarLayer({
      avatars, avatarPositions: { ada: position(avatars.ada), bora: position(avatars.bora), cem: position(avatars.cem) },
      localUserId: "ada", localUserLabel: "You", bubbles: [], onDismissBubble: () => undefined, dismissBubbleLabel: "x",
      partnerJustJoined: false, motionPolicy: { animateBreathe: false }, depthScene
    })
    const [bodies] = layer.props.children as { type: (props: unknown) => unknown; props: unknown }[]
    const fragment = bodies!.type(bodies!.props) as { props: { children: unknown[] } }
    return fragment.props.children.flat(2) as { type: unknown; props: Record<string, unknown> }[]
  }) as { type: unknown; props: Record<string, unknown> }[]
  const fronts = drawn.filter((node) => node.type === "Front")
  assert.deepEqual(fronts.map((node) => node.props.testID).sort(), [`mini-room-front-${S0}`, `mini-room-front-${S1}`])
  for (const front of fronts) {
    const hotspotId = String(front.props.testID).replace("mini-room-front-", "")
    assert.equal((front.props.item as RoomV2FurnitureRenderItem).renderId, SOFA.renderId)
    assert.equal(front.props.frontVisibleHeight, SEATS[hotspotId]!.art.frontVisibleHeight, "cut at her own cushion edge")
  }
  const zOf = (id: string) => drawn.find((node) => (node.props.avatar as AvatarState | undefined)?.userId === id)!.props.zIndex as number
  const frontZ = (hotspotId: string) => fronts.find((node) => node.props.testID === `mini-room-front-${hotspotId}`)!.props.zIndex as number
  const sofaZ = drawn.find((node) => node.type === "Sprite" && (node.props.item as RoomV2FurnitureRenderItem).renderId === SOFA.renderId)!
    .props.zIndex as number
  const [far, near] = SEATS[S0]!.drawRank === 0 ? [["ada", S0], ["bora", S1]] : [["bora", S1], ["ada", S0]]
  const stack = [sofaZ, zOf(far![0]!), frontZ(far![1]!), zOf(near![0]!), frontZ(near![1]!)]
  assert.deepEqual([...stack].sort((a, b) => a - b), stack, JSON.stringify(stack))
  assert.ok(zOf("cem") > frontZ(near![1]!), "standing in front of the sofa: over both sitters")
  runtime.unmount()
})
