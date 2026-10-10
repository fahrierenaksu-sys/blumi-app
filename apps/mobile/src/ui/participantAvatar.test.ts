import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarSelection } from "@blumi/contracts"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import type * as Participant from "./participantAvatar"

type Element = { type: unknown; props: Record<string, unknown> }

/** Expands function components while the runtime is rendering, so nested hooks share the render's slots. */
function expand(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) expand(child, found)
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Element
    if (typeof element.type === "function") expand((element.type as (props: unknown) => unknown)(element.props), found)
    else {
      found.push(element)
      expand(element.props.children, found)
    }
  }
  return found
}

function mount() {
  const runtime = createFakeReactRuntime()
  const source = loadSourceWithFakeReact<typeof Participant>("ui/participantAvatar.tsx", runtime, {
    real: ["../features/chat/chatParticipantAvatar"],
    modules: {
      "./useStableByContent": loadSourceWithFakeReact("ui/useStableByContent.ts", runtime),
      "react-native": createReactNativeStub().module,
      "../features/avatar/components/AvatarPortrait": { AvatarPortrait: "AvatarPortrait" },
      "./avatar": { Avatar: "Monogram", pickAvatarSwatch: (seed: string) => ({ bg: `swatch:${seed}` }) }
    }
  })
  return {
    runtime,
    render: (props: Parameters<typeof Participant.ParticipantAvatar>[0]) =>
      runtime.render(() => expand(source.ParticipantAvatar(props)))
  }
}

// An old-looking stored look: item IDs the 2.5D rigs have no art for. The portrait resolver coerces it.
const LEGACY_AVATAR: AvatarSelection = {
  presetId: "avatar_v2_body_default",
  revision: 4,
  loadout: {
    schemaVersion: 2,
    bodyId: "avatar_v2_body_default",
    faceId: "face_default",
    eyesId: "eyes_default",
    noseId: "nose_default",
    mouthId: "mouth_default",
    hairId: "hair_default",
    topId: "top_default",
    bottomId: "bottom_default",
    dressId: null,
    outerwearId: null,
    shoesId: "shoes_default",
    accessoryIds: []
  }
}
const portraitOf = (elements: Element[]) => elements.find((element) => element.type === "AvatarPortrait")

test("a complete avatar draws a round portrait of exactly the received loadout, inside the ring", () => {
  const f = mount()
  const elements = f.render({ name: "Partner", seed: "partner", avatar: LEGACY_AVATAR, size: 56, ring: "soft" })
  const portrait = portraitOf(elements)
  assert.ok(portrait, "a portrait is drawn")
  assert.deepEqual(portrait.props.loadout, LEGACY_AVATAR.loadout)
  assert.deepEqual(portrait.props.hints, { presetId: LEGACY_AVATAR.presetId })
  assert.equal(portrait.props.size, 56 - 2 * 1.5)
  assert.equal(portrait.props.backgroundColor, "swatch:partner")
  assert.equal(elements.some((element) => element.type === "Monogram"), false)
  f.runtime.unmount()
})

test("without a ring the portrait fills the whole circle", () => {
  const f = mount()
  const portrait = portraitOf(f.render({ name: "Partner", seed: "partner", avatar: LEGACY_AVATAR, size: 44 }))
  assert.equal(portrait?.props.size, 44)
  f.runtime.unmount()
})

test("no avatar, or one without a complete loadout, keeps the monogram", () => {
  for (const avatar of [undefined, { presetId: "avatar_v2_body_default" } as AvatarSelection]) {
    const f = mount()
    const elements = f.render({ name: "Partner", seed: "partner", avatar, size: 56, ring: "soft" })
    assert.equal(portraitOf(elements), undefined)
    assert.equal(elements.filter((element) => element.type === "Monogram").length, 1)
    f.runtime.unmount()
  }
})

test("an equal avatar object from a list update keeps the portrait's props; a changed look does not", () => {
  const f = mount()
  const props = { name: "Partner", seed: "partner", size: 56, ring: "soft" as const }
  const first = portraitOf(f.render({ ...props, avatar: LEGACY_AVATAR }))
  const equalClone = { ...LEGACY_AVATAR, loadout: { ...LEGACY_AVATAR.loadout, accessoryIds: [] } } as AvatarSelection
  const second = portraitOf(f.render({ ...props, avatar: equalClone }))
  assert.strictEqual(second?.props.loadout, first?.props.loadout)
  assert.strictEqual(second?.props.hints, first?.props.hints)
  const changed = { ...LEGACY_AVATAR, loadout: { ...LEGACY_AVATAR.loadout, hairId: "hair_other" } } as AvatarSelection
  const third = portraitOf(f.render({ ...props, avatar: changed }))
  assert.notStrictEqual(third?.props.loadout, first?.props.loadout)
  assert.equal((third?.props.loadout as { hairId: string }).hairId, "hair_other")
  f.runtime.unmount()
})
