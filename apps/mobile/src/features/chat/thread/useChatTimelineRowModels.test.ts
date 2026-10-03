import assert from "node:assert/strict"
import test from "node:test"
import type { ChatPartnerReceipts } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import type * as Hook from "./useChatTimelineRowModels"
import type { ChatTimelineRowModels, LocalChatMessageDeliveryState } from "./chatThreadModel"

function message(key: string, sender: string, sentAt: string): ChatTimelineItem {
  return { kind: "message", createdAt: sentAt, message: {
    messageId: key, threadId: "synthetic-thread", senderUserId: sender, body: "Synthetic message", sentAt
  } }
}

function mount() {
  const runtime = createFakeReactRuntime()
  let clock = new Date(2026, 6, 21, 12).getTime()
  class HookDate extends Date {
    constructor(value?: number, month?: number, day?: number) {
      super(value === undefined ? clock : month === undefined ? value : new Date(value, month, day).getTime())
    }
  }
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatTimelineRowModels.ts", runtime, {
    real: ["./chatThreadModel"], globals: { Date: HookDate }
  })
  const sentAt = new Date(2026, 6, 21, 9).toISOString()
  const own = message("synthetic-own", "synthetic-self", sentAt)
  const partner = message("synthetic-partner", "synthetic-other", new Date(2026, 6, 21, 9, 1).toISOString())
  const localStates = new Map<string, LocalChatMessageDeliveryState>()
  let deliveryReadsAllowed = true
  const getter = (key: string): LocalChatMessageDeliveryState => {
    assert.equal(deliveryReadsAllowed, true, "an unrelated render must not rescan the immutable timeline snapshot")
    return localStates.get(key) ?? "sent"
  }
  let input: Parameters<typeof hook.useChatTimelineRowModels>[0] = {
    timeline: [own, partner], currentUserId: "synthetic-self", locale: "en", getMessageDeliveryState: getter,
    deliveryKey: "sent|sent"
  }
  const render = (patch: Partial<typeof input> = {}): ChatTimelineRowModels => {
    input = { ...input, ...patch }
    return runtime.render(() => hook.useChatTimelineRowModels(input))
  }
  return { runtime, render, own, partner, sentAt, localStates,
    setDeliveryReadsAllowed: (allowed: boolean) => { deliveryReadsAllowed = allowed },
    setClock: (date: Date) => { clock = date.getTime() }
  }
}

test("unrelated screen renders reuse row models without reading the delivery store", () => {
  const f = mount()
  const first = f.render()
  f.setDeliveryReadsAllowed(false)
  assert.equal(f.render(), first)
  assert.equal(f.render(), first)
  f.runtime.unmount()
})

test("delivery-only failure, retry and acknowledgement update the affected row with a stable getter", () => {
  const f = mount()
  f.localStates.set("synthetic-own", "sending")
  const sending = f.render({ deliveryKey: "sending|sent" })
  assert.equal(sending.get("message:synthetic-own")?.row.deliveryState, "sending")
  f.localStates.set("synthetic-own", "failed")
  const failed = f.render({ deliveryKey: "failed|sent" })
  assert.equal(failed.get("message:synthetic-own")?.row.deliveryState, "failed")
  assert.equal(failed.get("message:synthetic-partner"), sending.get("message:synthetic-partner"))
  f.localStates.set("synthetic-own", "sending")
  const retrying = f.render({ deliveryKey: "sending|sent" })
  assert.equal(retrying.get("message:synthetic-own")?.row.deliveryState, "sending")
  f.localStates.set("synthetic-own", "sent")
  const sent = f.render({ deliveryKey: "sent|sent" })
  assert.equal(sent.get("message:synthetic-own")?.row.deliveryState, "sent")
  assert.equal(sent.get("message:synthetic-partner"), sending.get("message:synthetic-partner"))
  f.runtime.unmount()
})

test("receipt-only updates remain visible and receipt removal hides read state", () => {
  const f = mount()
  const sent = f.render()
  const cursor = { messageId: "synthetic-own", sentAt: f.sentAt }
  const receipts: ChatPartnerReceipts = { deliveredUpTo: cursor }
  const delivered = f.render({ partnerReceipts: receipts })
  assert.equal(delivered.get("message:synthetic-own")?.row.deliveryState, "delivered")
  assert.equal(delivered.get("message:synthetic-partner"), sent.get("message:synthetic-partner"))
  const read = f.render({ partnerReceipts: { ...receipts, readUpTo: cursor } })
  assert.equal(read.get("message:synthetic-own")?.row.deliveryState, "read")
  const disabled = f.render({ partnerReceipts: undefined })
  assert.equal(disabled.get("message:synthetic-own")?.row.deliveryState, "sent")
  f.runtime.unmount()
})

test("locale and local-day changes refresh date labels while unaffected rows retain their models", () => {
  const f = mount()
  const english = f.render()
  assert.equal(english.get("message:synthetic-own")?.row.dateLabel, "Today")
  const turkish = f.render({ locale: "tr" })
  assert.equal(turkish.get("message:synthetic-own")?.row.dateLabel, "Bugün")
  assert.equal(turkish.get("message:synthetic-partner"), english.get("message:synthetic-partner"))
  f.setClock(new Date(2026, 6, 22, 0, 1))
  const nextDay = f.render()
  assert.equal(nextDay.get("message:synthetic-own")?.row.dateLabel, "Dün")
  assert.equal(nextDay.get("message:synthetic-partner"), turkish.get("message:synthetic-partner"))
  f.runtime.unmount()
})

test("the midnight memo refresh preserves yesterday across a daylight-saving transition", () => {
  const previousTimezone = process.env.TZ
  let fixture: ReturnType<typeof mount> | undefined
  try {
    process.env.TZ = "America/New_York"
    fixture = mount()
    fixture.setClock(new Date(2025, 2, 9, 12))
    const row = message("synthetic-dst", "synthetic-self", new Date(2025, 2, 9, 9).toISOString())
    const today = fixture.render({ timeline: [row] })
    assert.equal(today.get("message:synthetic-dst")?.row.dateLabel, "Today")
    fixture.setClock(new Date(2025, 2, 10, 0, 1))
    const yesterday = fixture.render()
    assert.equal(yesterday.get("message:synthetic-dst")?.row.dateLabel, "Yesterday")
    fixture.setDeliveryReadsAllowed(false)
    assert.equal(fixture.render(), yesterday)
  } finally {
    fixture?.runtime.unmount()
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test("a timezone change refreshes historical labels when both local midnights have the same epoch", () => {
  const previousTimezone = process.env.TZ
  let fixture: ReturnType<typeof mount> | undefined
  try {
    process.env.TZ = "Pacific/Honolulu"
    fixture = mount()
    fixture.setClock(new Date("2026-10-03T11:00:00.000Z"))
    const row = message("synthetic-zone", "synthetic-self", "2026-01-05T00:30:00.000Z")
    const before = fixture.render({ timeline: [row] })
    const date = new Date(row.createdAt)
    assert.equal(before.get("message:synthetic-zone")?.row.dateLabel, "Jan 4")
    assert.equal(before.get("message:synthetic-zone")?.row.dateLabel,
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date))
    process.env.TZ = "Pacific/Kiritimati"
    const after = fixture.render()
    assert.equal(after.get("message:synthetic-zone")?.row.dateLabel, "Jan 5")
    assert.equal(after.get("message:synthetic-zone")?.row.dateLabel,
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date))
    fixture.setDeliveryReadsAllowed(false)
    assert.equal(fixture.render(), after)
  } finally {
    fixture?.runtime.unmount()
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})
