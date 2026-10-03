import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { getRoomInviteCardState } from "./chatRoomInviteCardModel"
import type { ChatRoomInviteAction, ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"
import type * as Card from "./ChatRoomInviteCard"

type Element = { type: unknown; props: Record<string, unknown> }

function renderedElements(node: unknown, elements: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) renderedElements(child, elements)
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Element
    if (typeof element.type === "function") {
      renderedElements(element.type(element.props), elements)
    } else {
      elements.push(element)
      renderedElements(element.props.children, elements)
    }
  }
  return elements
}

const invite: ChatRoomInviteTimelineItem = {
  kind: "room_invite", inviteId: "synthetic-invitation", threadId: "synthetic-thread",
  senderUserId: "synthetic-sender", recipientUserId: "synthetic-recipient",
  createdAt: "2026-10-02T10:00:00.000Z", status: "accepted", roomSessionId: "synthetic-room"
}

function mount(allowHeavyContent = false) {
  const runtime = createFakeReactRuntime()
  const attachedSources = new Set<string>()
  const actions: ChatRoomInviteAction[] = []
  const heavy = (type: string) => (props: Record<string, unknown>) => {
    assert.equal(allowHeavyContent, true, "compact invitations must never mount the room scene or gradient subtree")
    return { type, props }
  }
  const card = loadSourceWithFakeReact<typeof Card>("features/chat/ChatRoomInviteCard.tsx", runtime, {
    real: ["./chatRoomInviteCardModel", "../../ui/theme"],
    modules: {
      "react-native": createReactNativeStub().module,
      "@expo/vector-icons/Ionicons": "Icon",
      "../../ui/linearGradient": { LinearGradient: heavy("Gradient") },
      "./ChatRoomInviteScene": { ChatRoomInviteScene: heavy("RoomScene") },
      "./roomDoorFlight": {
        getRoomDoorKey: (key: string) => key,
        roomDoorSources: { attach: (key: string) => {
          attachedSources.add(key)
          return () => { attachedSources.delete(key) }
        } }
      },
      "../../ui/flight/flightSources": { measureViewInWindow: () => undefined }
    }
  })
  let input: Parameters<typeof card.ChatRoomInviteCard>[0] = {
    invite, currentUserId: "synthetic-recipient", locale: "en",
    you: { name: "You", userId: "synthetic-recipient" },
    partner: { name: "Partner", userId: "synthetic-sender" },
    onAction: (action) => { actions.push(action) }
  }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }
    return renderedElements(runtime.render(() => card.ChatRoomInviteCard(input)))
  }
  return { runtime, render, actions, attachedSources }
}

test("compact historical invitations show sender and status without mounting the room scene", () => {
  for (const locale of ["en", "tr"] as const) {
    for (const status of ["accepted", "expired", "declined", "cancelled"] as const) {
      const f = mount()
      const entry = { ...invite, status }
      const state = getRoomInviteCardState(entry, "synthetic-recipient", locale)
      const elements = f.render({ invite: entry, locale, compact: true })
      const summary = elements.find((element) => element.props.accessible === true)
      assert.ok(summary, "the invitation summary is available as one readable accessibility element")
      const label = String(summary.props.accessibilityLabel)
      assert.ok(label.includes("Partner"))
      assert.ok(label.includes(state.label))
      assert.ok(label.includes(state.statusLabel))
      assert.ok(elements.some((element) => element.type === "Text" && element.props.children === state.statusLabel))
      assert.deepEqual([...f.attachedSources], [], "an unmounted historical door cannot become a flight source")
      f.runtime.unmount()
    }
  }
})

test("compact accepted invitations preserve the same backend-validated room entry action", () => {
  const f = mount()
  const state = getRoomInviteCardState(invite, "synthetic-recipient", "en")
  const elements = f.render({ compact: true })
  const entry = elements.find((element) => element.props.accessibilityRole === "button" && element.props.accessibilityLabel === state.primaryLabel)
  assert.ok(entry)
  assert.equal(entry.props.disabled, false)
  ;(entry.props.onPress as () => void)()
  assert.deepEqual(f.actions, [state.primaryAction])
  f.runtime.unmount()
})

test("compact mode preserves participant actions, busy state and access restrictions", () => {
  for (const user of ["synthetic-sender", "synthetic-recipient", "synthetic-outsider"]) {
    const f = mount()
    const pending = { ...invite, status: "pending" as const, roomSessionId: undefined }
    const state = getRoomInviteCardState(pending, user, "en")
    const elements = f.render({ invite: pending, currentUserId: user, compact: true })
    const buttons = elements.filter((element) => element.props.accessibilityRole === "button")
    for (const action of [state.primaryAction, state.secondaryAction]) {
      if (!action) continue
      const label = action === state.primaryAction ? state.primaryLabel : state.secondaryLabel
      const button = buttons.find((element) => element.props.accessibilityLabel === label)
      assert.ok(button)
      assert.equal(button.props.disabled, false)
      ;(button.props.onPress as () => void)()
    }
    assert.deepEqual(f.actions, [state.primaryAction, state.secondaryAction].filter(Boolean))
    if (user === "synthetic-outsider") assert.deepEqual(buttons, [])
    const busy = f.render({ isBusy: true })
    for (const button of busy.filter((element) => element.props.accessibilityRole === "button")) {
      assert.equal(button.props.disabled, true)
      assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true })
    }
    f.runtime.unmount()
  }
})

test("the default full card keeps its room scene and switching to compact detaches its door", () => {
  const f = mount(true)
  const full = f.render()
  assert.ok(full.some((element) => element.type === "RoomScene"))
  assert.ok(full.some((element) => element.type === "Gradient"))
  assert.ok(f.attachedSources.has(invite.threadId))
  const compact = f.render({ compact: true })
  assert.ok(compact.every((element) => element.type !== "RoomScene" && element.type !== "Gradient"))
  assert.deepEqual([...f.attachedSources], [])
  f.runtime.unmount()
})
