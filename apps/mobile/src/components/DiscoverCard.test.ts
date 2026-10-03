import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"

// A Discover card behind the top one draws its chibi without the startup
// receipt listener; promotion to the top card adds it. The chibi must not be
// remounted then (it would blank and pop in), and the receipt must still
// arrive although its layers are already on screen and never display again.

interface Element {
  type: unknown
  key?: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function RoomAvatarRenderer2D() {
  return null
}

function findRenderer(node: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRenderer(child)
      if (found) return found
    }
    return undefined
  }
  const element = node as Element
  if (element.type === RoomAvatarRenderer2D) return element
  return findRenderer(element.props?.children)
}

const LAYERS = [
  { type: "body", id: "body-1" },
  { type: "hair", id: "hair-1" }
]

function mountPreview() {
  const runtime = createFakeReactRuntime()
  const { CandidateAvatarPreview } = loadSourceWithFakeReact<{
    CandidateAvatarPreview: (props: Record<string, unknown>) => unknown
  }>("components/DiscoverCard.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "../features/avatarV2/room/components/RoomAvatarRenderer2D": { RoomAvatarRenderer2D },
      "../features/avatarV2/room/avatarRoomSelectors": { getRoomAvatarRenderLayers: () => LAYERS },
      "../features/avatarV2/candidateAvatarSnapshot": {
        createCandidateAvatarAppearance: () => ({}),
        createCandidateAvatarSnapshot: () => ({})
      }
    },
    inertUnknown: true
  })
  const render = (props: Record<string, unknown>) => {
    const output = runtime.render(() => CandidateAvatarPreview(props))
    const renderer = findRenderer(output)
    assert.ok(renderer, "the preview draws the layered avatar")
    return renderer
  }
  return { render }
}

const snapshot = { displayName: "Defne", label: "chibi", presetId: "preset-a" }

test("a card promoted to the top keeps its chibi mounted and still reports it displayed", () => {
  const preview = mountPreview()
  // Behind the top card: no listener yet, the layers display.
  const behind = preview.render({ snapshot, stage: "discover" })
  const reportLayer = behind.props.onLayerDisplay as (id: string) => void
  reportLayer("body:body-1")
  reportLayer("hair:hair-1")

  // Promoted: the startup receipt listener arrives.
  let receipts = 0
  const onTop = preview.render({ snapshot, stage: "discover", onDisplay: () => { receipts += 1 } })
  assert.equal(onTop.key, behind.key, "same identity, so the layers are not remounted")
  assert.equal(onTop.props.onLayerDisplay, behind.props.onLayerDisplay)
  assert.equal(receipts, 1, "the receipt arrives for layers already on screen")
})

test("the receipt waits for every layer and starts over for a different avatar", () => {
  const preview = mountPreview()
  let receipts = 0
  const onDisplay = () => { receipts += 1 }
  const first = preview.render({ snapshot, onDisplay })
  ;(first.props.onLayerDisplay as (id: string) => void)("body:body-1")
  preview.render({ snapshot, onDisplay })
  assert.equal(receipts, 0, "one layer is not the whole chibi")

  const changed = preview.render({ snapshot: { ...snapshot, presetId: "preset-b" }, onDisplay })
  assert.notEqual(changed.key, first.key, "a new look is a new avatar")
  const report = changed.props.onLayerDisplay as (id: string) => void
  report("hair:hair-1")
  preview.render({ snapshot: { ...snapshot, presetId: "preset-b" }, onDisplay })
  assert.equal(receipts, 0, "receipts of the previous avatar do not count")
  report("body:body-1")
  preview.render({ snapshot: { ...snapshot, presetId: "preset-b" }, onDisplay })
  assert.equal(receipts, 1)
})
