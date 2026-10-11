import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import { candidateAvatarInput } from "../features/avatar/model/candidateAvatarInput"

// The chibi on Discover and in the match moment is always baked (owner decision: the Discover deck is still, no live
// canvas), so the deck's cards, behind or on top, never mount a GPU canvas. Outside the room it is the showcase
// (front) view, which draws as today's 3/4 still in the same crop until the look has front art; the card back keeps
// the 3/4 room view.

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
function AvatarShowcase() {
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
      "../features/avatar/components/AvatarShowcase": { AvatarShowcase },
      "../features/avatar/model/candidateAvatarInput": { candidateAvatarInput }
    },
    inertUnknown: true
  })
  const render = (props: Record<string, unknown>) => runtime.render(() => CandidateAvatarPreview(props))
  return { render }
}

const snapshot = { kind: "candidate_avatar_snapshot", displayName: "Defne", label: "chibi", bodyPreset: "female" }

test("a Discover front card is the showcase still of the whole figure, whether it is behind or on top of the deck", () => {
  const preview = mountPreview()
  const behind = preview.render({ snapshot, stage: "discover", size: 300 })
  const onTop = preview.render({ snapshot, stage: "discover", size: 300, live: true, liveActive: true })
  for (const output of [behind, onTop]) {
    assert.equal(find(output, AvatarHero), undefined, "no live hero on the Discover deck")
    const figure = find(output, AvatarShowcase)
    assert.ok(figure, "the card draws the showcase still")
    assert.equal(figure.props.crop, "card")
    assert.equal(figure.props.fallbackCrop, "full", "until front art lands it is the whole 3/4 figure, as before")
    assert.equal(figure.props.accessibilityLabel, "Defne chibi")
  }
  assert.equal(find(onTop, AvatarShowcase)?.type, find(behind, AvatarShowcase)?.type, "promotion keeps the same figure component")
})

test("the figure keeps the size the card gave the still", () => {
  const figure = find(mountPreview().render({ snapshot, stage: "discover", size: 300 }), AvatarShowcase)
  assert.ok(Math.abs((figure?.props.width as number) - 300 * 0.78) < 1e-9)
  assert.ok(Math.abs((figure?.props.height as number) - 300 * 0.82) < 1e-9)
})

test("the startup receipt and error of the figure come from the showcase", () => {
  const preview = mountPreview()
  const onDisplay = () => undefined
  const onImageError = () => undefined
  const figure = find(preview.render({ snapshot, onDisplay, onImageError }), AvatarShowcase)
  assert.equal(figure?.props.onDisplay, onDisplay)
  assert.equal(figure?.props.onError, onImageError)
})

test("a stage without live props (the match flight) is the same showcase figure", () => {
  const preview = mountPreview()
  const flight = preview.render({ snapshot, stage: "discover", size: 120 })
  assert.equal(find(flight, AvatarHero), undefined)
  assert.equal(find(flight, AvatarShowcase)?.props.fallbackCrop, "full")
})

test("the match moment shows the partner's half-body still turned towards the person until front art lands", () => {
  const preview = mountPreview()
  const figure = find(preview.render({ snapshot, stage: "match", size: 96, crop: "half", mirror: true }), AvatarShowcase)
  assert.equal(figure?.props.crop, "card")
  assert.equal(figure?.props.fallbackCrop, "half")
  assert.equal(figure?.props.mirror, true)
})

test("the card back keeps the 3/4 room view in its half crop, never a live canvas", () => {
  const preview = mountPreview()
  const output = preview.render({ snapshot, crop: "half", view: "room", live: true, liveActive: true })
  assert.equal(find(output, AvatarHero), undefined)
  assert.equal(find(output, AvatarShowcase), undefined)
  assert.equal(find(output, AvatarStill)?.props.crop, "half")
})
