import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import { candidateAvatarInput } from "../features/avatar/model/candidateAvatarInput"

// The chibi on Discover and in the match moment is the baked 2.5D still. Discover's front cards are the
// live-capable hero (a still until the live budget grants a canvas), so promoting a card to the top card never
// remounts its figure; everything else is a plain still.

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

test("a Discover front card is the hero; it only asks for a live canvas while it is the active top card", () => {
  const preview = mountPreview()
  const behind = find(preview.render({ snapshot, stage: "discover", live: true, liveActive: false }), AvatarHero)
  assert.ok(behind, "a card behind the top one is drawn by the hero, as a still")
  assert.equal(behind.props.liveScope, "screen")
  assert.equal(behind.props.liveActive, false)

  const onTop = find(preview.render({ snapshot, stage: "discover", live: true, liveActive: true }), AvatarHero)
  assert.ok(onTop)
  assert.equal(onTop.type, behind.type, "promotion keeps the same figure mounted")
  assert.equal(onTop.props.liveActive, true)
})

test("the startup receipt and error of the figure come from the still under the hero", () => {
  const preview = mountPreview()
  const onDisplay = () => undefined
  const onImageError = () => undefined
  const hero = find(preview.render({ snapshot, live: true, onDisplay, onImageError }), AvatarHero)
  assert.equal(hero?.props.onStillDisplay, onDisplay)
  assert.equal(hero?.props.onStillError, onImageError)
})

test("everything else is a baked still, never the live hero", () => {
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

test("a half-body crop never mounts the live hero, even when asked", () => {
  const preview = mountPreview()
  const output = preview.render({ snapshot, crop: "half", live: true, liveActive: true })
  assert.equal(find(output, AvatarHero), undefined)
})
