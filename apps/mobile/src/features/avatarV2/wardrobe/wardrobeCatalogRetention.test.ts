import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import * as layout from "./wardrobeStageLayout"
import { findElements } from "../../../testing/reanimatedClock"
import type { WardrobeCatalogCardModel } from "./wardrobeCatalogModel"

const { reuseWardrobeCards } = loadSourceWithFakeReact<{
  reuseWardrobeCards: (previous: readonly WardrobeCatalogCardModel[] | undefined, next: WardrobeCatalogCardModel[]) => readonly WardrobeCatalogCardModel[]
}>("features/avatarV2/wardrobe/wardrobeCatalogModel.ts", createFakeReactRuntime(), { inertUnknown: true })

test("batched category and section bursts keep the last requested selection", () => {
  const runtime = createFakeReactRuntime()
  const setters: (() => void)[] = []
  const readState = runtime.react.useState as any
  runtime.react.useState = (initial: any) => {
    const [value, setValue] = readState(initial)
    return [value, (next: any) => setters.push(() => setValue(next))]
  }
  const avatar = { bodyId: "base" }
  const tabs = [{ id: "top", categories: ["top", "bottom", "hair"] }]
  const { WardrobeV2Screen } = loadSourceWithFakeReact<any>("screens/WardrobeV2Screen.tsx", runtime, {
    inertUnknown: true,
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": { __esModule: true, default: { View: "Animated.View" }, useSharedValue: () => ({ value: 0 }) },
      "../features/session/authLocale": { getAppLocale: () => "tr" },
      "../features/avatarV2/wardrobe/wardrobeCopy": { AVATAR_STUDIO_COPY: { tr: {} } },
      "../ui/animations": { useReducedMotion: () => true },
      "../ui/bottomPanelEntrance": { useBottomPanelEntranceProps: () => ({}) },
      "../features/avatarV2/state/AvatarV2Provider": { useAvatarV2: () => ({ avatar, catalog: [], canEquipItem: () => false }) },
      "../features/avatarV2/wardrobeCategoryModel": {
        WARDROBE_CATEGORIES: [{ id: "top" }, { id: "bottom" }, { id: "hair" }],
        getAvatarStudioDefaultCategory: (section: string) => section === "closet" ? "top" : "hair",
        getAvatarStudioTabs: () => tabs,
        resolveAvatarStudioCategory: (_tabs: unknown, category: string) => category,
        findAvatarStudioTab: () => tabs[0]
      },
      "../features/avatarV2/wardrobe/wardrobeCatalogModel": { getWardrobeActiveItems: () => [], buildWardrobeCards: () => [], reuseWardrobeCards },
      "../features/avatarV2/wardrobe/useWardrobeTryOn": { useWardrobeTryOn: () => ({ displayedAvatar: avatar, dismissTryOnPreview: () => {} }) },
      "../features/avatarV2/wardrobe/useWardrobeLockedPreview": { useWardrobeLockedPreview: () => ({ stageAvatar: avatar, clearLockedPreview: () => {} }) },
      "../features/avatarV2/wardrobe/useWardrobeDone": { useWardrobeDone: () => ({}) },
      "../features/avatarV2/wardrobe/useWardrobeCategoryMotion": { useWardrobeCatalogTransition: (input: any) => ({ shownCategory: input.activeCategory, cards: input.cards }) },
      "../features/avatarV2/wardrobe/WardrobeSectionSwitcher": { WardrobeSectionSwitcher: "Sections" },
      "../features/avatarV2/wardrobe/WardrobeCategoryTabs": { WardrobeCategoryTabs: "Categories" }
    }
  })
  runtime.render(() => WardrobeV2Screen({ navigation: {} }))
  const section = () => findElements(runtime.output, (element) => element.type === "Sections")[0].props as any
  const category = () => findElements(runtime.output, (element) => element.type === "Categories")[0].props as any
  let chooseCategory = category().onSelectCategory
  chooseCategory("bottom")
  chooseCategory("top")
  for (const commit of setters.splice(0)) commit()
  assert.equal(category().activeCategory, "top")
  const chooseSection = section().onSelectSection
  chooseSection("appearance")
  chooseSection("closet")
  for (const commit of setters.splice(0)) commit()
  assert.equal(section().activeSection, "closet")
  assert.equal(category().activeCategory, "top")
  chooseCategory = category().onSelectCategory
  chooseCategory("bottom")
  chooseCategory("hair")
  for (const commit of setters.splice(0)) commit()
  assert.equal(category().activeCategory, "hair")
  runtime.unmount()
})

test("category data is reused only when every visible card state and action item stays current", () => {
  const item = { id: "item", type: "hair", name: "current" } as any
  const previous = [{ item, equipped: false, itemStateLabel: "choose", locked: false, previewing: false, previewSource: 1 }]
  assert.equal(reuseWardrobeCards(previous, [{ ...previous[0] }]), previous)
  for (const update of [
    { locked: true }, { equipped: true }, { previewing: true }, { itemStateLabel: "owned" },
    { previewSource: 2 }, { item: { ...item, name: "refreshed" } }
  ]) {
    const next = [{ ...previous[0], ...update }]
    assert.equal(reuseWardrobeCards(previous, next), next)
  }
})

function createShelfHarness(shelfOnly = false) {
  const runtime = createFakeReactRuntime()
  let Shelf: any
  runtime.react.memo = (component: any) => { Shelf = component; return component }
  const handlers: any[] = []
  const reactions: any[] = []
  const useRef = runtime.react.useRef as any
  const reanimated = {
    __esModule: true,
    default: { View: "Animated.View", FlatList: "FlatList" },
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedScrollHandler: (handler: any) => { handlers.push(handler); return handler },
    useAnimatedReaction: (_prepare: any, reaction: any) => { reactions.push(reaction) }
  }
  const { WardrobeCatalogList } = loadSourceWithFakeReact<any>("features/avatarV2/wardrobe/WardrobeCatalogList.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated,
      "react-native-worklets": { scheduleOnRN: (fn: any, ...args: any[]) => fn(...args) },
      "./WardrobeCatalogCard": { WardrobeCatalogCard: "Card" },
      "./WardrobeCatalogEmpty": { WardrobeCatalogEmpty: "Empty" },
      "./wardrobeStageLayout": layout,
      "./wardrobeV2Styles": { WARDROBE_GRID_GAP: 8, WARDROBE_GRID_ROW_GAP: 8, wardrobeV2Styles: {} }
    }
  })
  const cards = Array.from({ length: 9 }, (_, index) => ({ item: { id: `choice-${index}` }, locked: false }))
  const pagePosition = { value: 0 }
  const reported: number[] = []
  let props: any = {
    activeCategory: "top", cards, cardsByCategory: new Map([["top", cards]]), catalogStyle: {}, switching: false,
    copy: {}, reduceMotion: false, onEquip: () => {}, onPreviewLocked: () => {}, onExploreShop: () => {},
    onPageChange: (page: number) => reported.push(page), pagePosition
  }
  if (!shelfOnly) runtime.render(() => WardrobeCatalogList(props))
  function shelves(): any[] { return (runtime.output as any).props.children.props.children }
  return {
    runtime, handlers, reactions, pagePosition, reported, shelves, Shelf, props,
    select: (category: string, nextCards = cards) => {
      props = { ...props, activeCategory: category, cardsByCategory: new Map([...props.cardsByCategory, [category, nextCards]]) }
      runtime.rerender()
    },
    replaceCards: (nextCards: any[]) => {
      props = { ...props, cardsByCategory: new Map([["top", nextCards]]) }
      runtime.rerender()
    }
  }
}

test("category return retains shelf identity and data while fresh entitlement models replace cached presentation", () => {
  const harness = createShelfHarness()
  const top = harness.shelves()[0]
  harness.select("hair")
  const hiddenTop = harness.shelves()[0]
  assert.equal(hiddenTop.key, top.key)
  assert.equal(hiddenTop.type, top.type)
  assert.equal(hiddenTop.props.cards, top.props.cards)
  assert.equal(hiddenTop.props.active, false)
  harness.select("top")
  assert.equal(harness.shelves()[0].type, top.type)
  assert.equal(harness.shelves()[0].props.cards, top.props.cards)
  const refreshed = [{ item: { id: "choice-0", name: "fresh catalog" }, locked: true, equipped: false }]
  harness.replaceCards(refreshed)
  assert.equal(harness.shelves()[0].props.cards, refreshed)
  assert.equal(harness.shelves()[0].props.cards[0].locked, true)
  harness.runtime.unmount()
})

test("retained shelf snaps an interrupted swipe and blocks hidden scroll and queued page announcements", () => {
  // Load a shelf against its own hook runtime using the real component returned
  // by the list; switching the active flag keeps all of its hook/native refs.
  const harness = createShelfHarness(true)
  let props = { ...harness.props, active: true, listWidth: 300 }
  harness.runtime.render(() => harness.Shelf(props))
  let tree: any = harness.runtime.output
  let list = tree.props.children.props.children
  const scrolls: number[] = []
  list.props.ref.current = { scrollToOffset: ({ offset }: any) => scrolls.push(offset) }
  list.props.onScroll.onScroll({ contentOffset: { x: 420 } })
  assert.equal(harness.pagePosition.value, 1.4)
  const oldReaction = harness.reactions.at(-1)
  props = { ...props, active: false }
  harness.runtime.rerender()
  tree = harness.runtime.output
  list = tree.props.children.props.children
  assert.equal(tree.props.pointerEvents, "none")
  assert.equal(tree.props.accessibilityElementsHidden, true)
  assert.equal(list.props.scrollEnabled, false)
  assert.equal(scrolls.at(-1), 300)
  const previousAnnouncement = [...harness.reported]
  oldReaction(2, 1)
  list.props.onScroll.onScroll({ contentOffset: { x: 600 } })
  assert.deepEqual(harness.reported, previousAnnouncement)
  assert.equal(harness.pagePosition.value, 1.4)
  props = { ...props, active: true }
  harness.runtime.rerender()
  assert.equal(harness.pagePosition.value, 1)
  assert.equal(harness.reported.at(-1), 1)
  props = { ...props, cards: props.cards.slice(0, 3) }
  harness.runtime.rerender()
  assert.equal(harness.pagePosition.value, 0)
  assert.equal(scrolls.at(-1), 0)
})

function loadScreenWithCardCounter() {
  const runtime = createFakeReactRuntime()
  const built: string[] = []
  const catalogItems: Record<string, { id: string }> = {}
  const tryOn = { displayed: { bodyId: "base", worn: "none" } }
  const tabs = [{ id: "closet", categories: ["top", "bottom", "hair", "shoes"] }]
  const retained = loadSourceWithFakeReact<any>("features/avatarV2/wardrobe/wardrobeRetainedCategories.ts", runtime, { inertUnknown: true })
  const { WardrobeV2Screen } = loadSourceWithFakeReact<any>("screens/WardrobeV2Screen.tsx", runtime, {
    inertUnknown: true,
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": { __esModule: true, default: { View: "Animated.View" }, useSharedValue: () => ({ value: 0 }) },
      "../features/session/authLocale": { getAppLocale: () => "tr" },
      "../features/avatarV2/wardrobe/wardrobeCopy": { AVATAR_STUDIO_COPY: { tr: {} } },
      "../ui/animations": { useReducedMotion: () => true },
      "../ui/bottomPanelEntrance": { useBottomPanelEntranceProps: () => ({}) },
      "../features/avatarV2/state/AvatarV2Provider": { useAvatarV2: () => ({ avatar: tryOn.displayed, catalog: [], canEquipItem: () => true }) },
      "../features/avatarV2/wardrobeCategoryModel": {
        WARDROBE_CATEGORIES: [{ id: "top" }, { id: "bottom" }, { id: "hair" }, { id: "shoes" }],
        getAvatarStudioDefaultCategory: () => "top",
        getAvatarStudioTabs: () => tabs,
        resolveAvatarStudioCategory: (_tabs: unknown, category: string) => category,
        findAvatarStudioTab: () => tabs[0]
      },
      "../features/avatarV2/wardrobe/wardrobeCatalogModel": {
        getWardrobeActiveItems: (input: any) => [catalogItems[input.category] ??= { id: input.category }],
        buildWardrobeCards: (input: any) => {
          built.push(input.items[0].id)
          return [{
            item: input.items[0], equipped: input.displayedAvatar.worn === input.items[0].id,
            itemStateLabel: "", locked: false, previewing: false
          }]
        },
        reuseWardrobeCards
      },
      "../features/avatarV2/wardrobe/useWardrobeTryOn": { useWardrobeTryOn: () => ({ displayedAvatar: tryOn.displayed, dismissTryOnPreview: () => {} }) },
      "../features/avatarV2/wardrobe/useWardrobeLockedPreview": { useWardrobeLockedPreview: () => ({ stageAvatar: tryOn.displayed, clearLockedPreview: () => {} }) },
      "../features/avatarV2/wardrobe/useWardrobeDone": { useWardrobeDone: () => ({}) },
      "../features/avatarV2/wardrobe/useWardrobeCategoryMotion": { useWardrobeCatalogTransition: (input: any) => ({ shownCategory: input.activeCategory, cards: input.cards }) },
      "../features/avatarV2/wardrobe/wardrobeRetainedCategories": retained,
      "../features/avatarV2/wardrobe/WardrobeCategoryTabs": { WardrobeCategoryTabs: "Categories" },
      "../features/avatarV2/wardrobe/WardrobeCatalogList": { WardrobeCatalogList: "List" }
    }
  })
  runtime.render(() => WardrobeV2Screen({ navigation: {} }))
  const list = () => findElements(runtime.output, (element) => element.type === "List")[0].props as any
  const selectCategory = (id: string) => {
    ;(findElements(runtime.output, (element) => element.type === "Categories")[0].props as any).onSelectCategory(id)
    runtime.rerender()
  }
  return { runtime, built, tryOn, list, selectCategory }
}

test("a try-on tap builds cards only for the shown and the previously visited category", () => {
  const screen = loadScreenWithCardCounter()
  assert.deepEqual(screen.built, ["top"])
  screen.selectCategory("bottom")
  screen.built.length = 0
  screen.tryOn.displayed = { bodyId: "base", worn: "bottom" }
  screen.runtime.rerender()
  assert.deepEqual([...screen.built].sort(), ["bottom", "top"])
  assert.equal(screen.list().cardsByCategory.get("bottom")[0].equipped, true)
  screen.runtime.unmount()
})

test("visited shelves are capped and evict the oldest category", () => {
  const screen = loadScreenWithCardCounter()
  screen.selectCategory("bottom")
  screen.selectCategory("hair")
  assert.deepEqual([...screen.list().cardsByCategory.keys()], ["bottom", "hair"])
  screen.selectCategory("bottom")
  screen.selectCategory("shoes")
  assert.deepEqual([...screen.list().cardsByCategory.keys()], ["bottom", "shoes"])
  screen.runtime.unmount()
})

test("a try-on tap keeps the card lists of unchanged categories identical", () => {
  const screen = loadScreenWithCardCounter()
  screen.selectCategory("bottom")
  const topCards = screen.list().cardsByCategory.get("top")
  screen.tryOn.displayed = { bodyId: "base", worn: "bottom" }
  screen.runtime.rerender()
  assert.equal(screen.list().cardsByCategory.get("top"), topCards)
  screen.runtime.unmount()
})

test("retained wardrobe categories keep visit order and never exceed the cap", () => {
  const { nextRetainedWardrobeCategories } = loadSourceWithFakeReact<any>(
    "features/avatarV2/wardrobe/wardrobeRetainedCategories.ts", createFakeReactRuntime(), { inertUnknown: true }
  )
  const start = ["top"]
  assert.equal(nextRetainedWardrobeCategories(start, "top"), start)
  assert.deepEqual(nextRetainedWardrobeCategories(start, "hair"), ["top", "hair"])
  assert.deepEqual(nextRetainedWardrobeCategories(["top", "hair"], "top"), ["hair", "top"])
  assert.deepEqual(nextRetainedWardrobeCategories(["top", "hair"], "shoes"), ["hair", "shoes"])
})
