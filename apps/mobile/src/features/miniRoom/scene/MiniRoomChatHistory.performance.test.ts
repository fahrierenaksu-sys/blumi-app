import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem } from "../roomChatHistoryModel"
import type * as HistoryModule from "./MiniRoomChatHistory"
import { MOTION_STAGGER } from "../../../ui/motionTokens"

type Element = { type: unknown; props: Record<string, any> }

function findList(element: Element): Element | undefined {
  if (element.type === "FlatList") return element
  const children = element.props.children
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child || typeof child !== "object") continue
    const found = findList(child)
    if (found) return found
  }
  return undefined
}

const row = (id: string, overrides: Partial<RoomChatHistoryItem> = {}): RoomChatHistoryItem => ({
  id, renderKey: id, body: "Fixture message", mine: true, delivery: "sent", showMeta: true,
  sentAt: "2026-10-03T09:00:00.000Z", ...overrides
})

function mount(items: RoomChatHistoryItem[]) {
  const runtime = createFakeReactRuntime()
  const { MiniRoomChatHistory } = loadSourceWithFakeReact<typeof HistoryModule>(
    "features/miniRoom/scene/MiniRoomChatHistory.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub({ FlatList: "FlatList" }).module,
        "react-native-reanimated": createReanimatedStub(runtime).module,
        "../../../ui/motion": { MOTION_STAGGER },
        "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" }
      },
      real: ["./miniRoomFirstAppearance", "../roomChatHistoryModel"]
    }
  )
  const reports: number[] = []
  let currentItems = items
  let onRecentRowsHeightChange = (height: number) => { reports.push(height) }
  const copy = getMiniRoomCopy("en")
  runtime.render(() => MiniRoomChatHistory({
    copy, items: currentItems, status: "ready", partnerName: "Partner", height: 200, onRecentRowsHeightChange
  }))
  const list = () => {
    const listElement = findList(runtime.output as Element)
    assert.ok(listElement, "non-empty history exposes its mounted list")
    return listElement
  }
  const rendered = (item: RoomChatHistoryItem) => list().props.renderItem({ item, index: currentItems.indexOf(item) }) as Element
  return {
    runtime, reports, list, rendered,
    update(next: RoomChatHistoryItem[], callback = onRecentRowsHeightChange) {
      currentItems = next
      onRecentRowsHeightChange = callback
      runtime.rerender()
    }
  }
}

test("history ACK retains native measurement and first appearance identity without renewing unrelated row props", () => {
  const pending = row("pending", { delivery: "sending" })
  const previous = row("previous")
  const history = mount([pending, previous])
  const originalList = history.list()
  const originalPending = history.rendered(pending)
  const originalPrevious = history.rendered(previous)
  const measure = originalPending.props.onMeasure
  measure(originalList.props.keyExtractor(pending), 60)
  measure(originalList.props.keyExtractor(previous), 40)
  const measuredTotal = history.reports.at(-1)
  assert.ok(measuredTotal && measuredTotal > 100)
  originalPending.props.stagger.markEntered(originalList.props.keyExtractor(pending))

  const confirmed = { ...pending, id: "confirmed", delivery: "sent" as const }
  history.update([confirmed, previous])
  assert.equal(history.list().props.keyExtractor(confirmed), originalList.props.keyExtractor(pending))
  assert.equal(history.list().props.renderItem, originalList.props.renderItem, "the list render callback remains stable")
  assert.deepEqual(history.rendered(previous).props, originalPrevious.props, "an unrelated memo row receives identical props")
  assert.equal(history.rendered(confirmed).props.stagger.slotOf(confirmed.renderKey), null, "ACK cannot replay entrance")
  assert.equal(history.reports.at(-1), measuredTotal)
  const fresh = row("fresh")
  history.update([fresh, confirmed, previous])
  assert.equal(history.rendered(fresh).props.onMeasure, measure)
  measure("fresh", 80)
  assert.equal(history.reports.at(-1), measuredTotal + 40, "latest height uses the retained acknowledged row measurement")
  measure("pending", 70)
  assert.equal(history.reports.at(-1), measuredTotal + 50, "native changes to ACK metadata still update its measurement")
  history.runtime.unmount()
})

test("stable row measurement reads the newest committed rows and callback and ignores invalid sizes", () => {
  const first = row("first")
  const second = row("second")
  const history = mount([first, second])
  const measure = history.rendered(first).props.onMeasure
  measure("first", 42.1)
  measure("second", 50)
  const initial = history.reports.at(-1)!
  const nextReports: number[] = []
  const newest = row("newest")
  history.update([newest, first, second], (height) => nextReports.push(height))
  measure("newest", 70)
  assert.equal(nextReports.at(-1), initial + 20)
  measure("newest", Number.NaN)
  measure("newest", 0)
  measure("newest", -1)
  assert.equal(nextReports.at(-1), initial + 20)
  assert.equal(history.reports.at(-1), initial, "the stale callback never receives new measurements")
  history.runtime.unmount()
})
