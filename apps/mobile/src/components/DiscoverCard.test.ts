import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import { candidateAvatarInput } from "../features/avatar/model/candidateAvatarInput"

// The chibi on Discover and in the match moment is always the baked 2.5D still (owner decision: the Discover deck
// is still, no live canvas), so the deck's cards, behind or on top, never mount a GPU canvas.

interface Element {
  type: unknown
  key?: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function AvatarHero() {
  return null
}
function AvatarStill() {
  return null
}

function find(node: unknown, type: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type)
      if (found) return found
    }
    return undefined
  }
  const element = node as Element
  if (element.type === type) return element
  return find(element.props?.children, type)
}

function mountPreview() {
  const runtime = createFakeReactRuntime()
  const { CandidateAvatarPreview } = loadSourceWithFakeReact<{
    CandidateAvatarPreview: (props: Record<string, unknown>) => unknown
  }>("components/DiscoverCard.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "../features/avatar/components/AvatarHero": { AvatarHero },
      "../features/avatar/components/AvatarStill": { AvatarStill },
      "../features/avatar/model/candidateAvatarInput": { candidateAvatarInput }
    },
    inertUnknown: true
  })
  const render = (props: Record<string, unknown>) => runtime.render(() => CandidateAvatarPreview(props))
  return { render }
}

const snapshot = { kind: "candidate_avatar_snapshot", displayName: "Defne", label: "chibi", bodyPreset: "female" }

test("a Discover front card is the baked still, whether it is behind or on top of the deck", () => {
  const preview = mountPreview()
  const behind = preview.render({ snapshot, stage: "discover", size: 300 })
  const onTop = preview.render({ snapshot, stage: "discover", size: 300, live: true, liveActive: true })
  for (const output of [behind, onTop]) {
    assert.equal(find(output, AvatarHero), undefined, "no live hero on the Discover deck")
    const still = find(output, AvatarStill)
    assert.ok(still, "the card draws the still")
    assert.equal(still.props.crop, "full")
  }
  assert.equal(find(onTop, AvatarStill)?.type, find(behind, AvatarStill)?.type, "promotion keeps the same figure component")
})

test("the startup receipt and error of the figure come from the still", () => {
  const preview = mountPreview()
  const onDisplay = () => undefined
  const onImageError = () => undefined
  const still = find(preview.render({ snapshot, onDisplay, onImageError }), AvatarStill)
  assert.equal(still?.props.onDisplay, onDisplay)
  assert.equal(still?.props.onError, onImageError)
})

test("a stage without live props is the same baked still", () => {
  const preview = mountPreview()
  const flight = preview.render({ snapshot, stage: "discover", size: 120 })
  assert.equal(find(flight, AvatarHero), undefined)
  assert.equal(find(flight, AvatarStill)?.props.crop, "full")
})

test("the match moment shows the partner's half-body still turned towards the person", () => {
  const preview = mountPreview()
  const still = find(preview.render({ snapshot, stage: "match", size: 96, crop: "half", mirror: true }), AvatarStill)
  assert.equal(still?.props.crop, "half")
  assert.equal(still?.props.mirror, true)
})

test("a half-body crop is a still, even when live props are passed", () => {
  const preview = mountPreview()
  const output = preview.render({ snapshot, crop: "half", live: true, liveActive: true })
  assert.equal(find(output, AvatarHero), undefined)
  assert.equal(find(output, AvatarStill)?.props.crop, "half")
})
