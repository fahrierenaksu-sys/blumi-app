import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Context from "./MiniRoomContext"

type Element = { type: unknown; props: Record<string, unknown> }

function collect(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) for (const child of node) collect(child, found)
  else if (node && typeof node === "object" && "props" in node) {
    const element = node as Element
    found.push(element)
    collect(element.props.children, found)
  }
  return found
}

function render(snapshots: Parameters<typeof Context.MiniRoomContext>[0]["snapshots"]) {
  const runtime = createFakeReactRuntime()
  const source = loadSourceWithFakeReact<typeof Context>("features/miniRoom/scene/MiniRoomContext.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": { __esModule: true, default: { View: "AnimatedView" }, useAnimatedStyle: (work: () => unknown) => work() },
      "../../avatar/components/AvatarPortrait": { AvatarPortrait: "AvatarPortrait" },
      "./miniRoomTransitionModel": { resolveMiniRoomContentOpacity: () => ({ context: 1 }) }
    }
  })
  const copy = { roomPairTitle: (name: string) => `with ${name}`, roomPairCaption: "caption" }
  const tree = runtime.render(() =>
    source.MiniRoomContext({ copy: copy as never, top: 0, partnerName: "Partner", snapshots, contentProgress: { value: 1 } as never, visible: true }))
  return collect(tree)
}

const snapshot = (role: "local" | "partner", avatarLoadout?: unknown) =>
  ({ userId: role, displayName: role, role, source: "avatar_v2_current_user", appearance: { base: "avatar_base_01", snapshotSource: "avatar_v2_current_user", avatarLoadout } }) as never

test("the context chips are two tiny portraits of each participant's own loadout, never a canvas", () => {
  const girl = { bodyId: "female-look" }
  const boy = { bodyId: "male-look" }
  const portraits = render({ local: snapshot("local", girl), partner: snapshot("partner", boy) }).filter((element) => element.type === "AvatarPortrait")
  assert.equal(portraits.length, 2)
  assert.strictEqual(portraits[0]!.props.loadout, girl)
  assert.strictEqual(portraits[1]!.props.loadout, boy)
  for (const portrait of portraits) assert.ok((portrait.props.size as number) <= 40, "the tiny class stays at 40 pt or less")
})

test("a participant without a known loadout shows an empty chip, not someone else's look", () => {
  const elements = render({ local: snapshot("local", { bodyId: "female-look" }), partner: snapshot("partner") })
  assert.equal(elements.filter((element) => element.type === "AvatarPortrait").length, 1)
})
