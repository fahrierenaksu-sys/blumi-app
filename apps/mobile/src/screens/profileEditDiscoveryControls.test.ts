import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// Discovery is global: nothing filters by distance. Profile edit must not
// offer a search-distance control, and saving must keep the stored value.
type Element = { type: unknown; props: Record<string, any> }

function collect(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found)
    return found
  }
  if (!node || typeof node !== "object" || !("props" in node)) return found
  const element = node as Element
  found.push(element)
  for (const value of Object.values(element.props ?? {})) collect(value, found)
  return found
}

function textOf(element: Element): string {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children])
    .filter((child) => typeof child === "string" || typeof child === "number")
    .join("")
}

const STORED_RADIUS_KM = 50

function renderProfileEdit(saved: unknown[]) {
  const runtime = createFakeReactRuntime()
  const { ProfileEditScreen } = loadSourceWithFakeReact<{ ProfileEditScreen: (props: unknown) => unknown }>(
    "screens/ProfileEditScreen.tsx",
    runtime,
    {
      inertUnknown: true,
      real: ["@blumi/contracts", "../features/session/profileEditCopy", "../features/session/profileEditModel"],
      modules: {
        "react-native": createReactNativeStub().module,
        "../ui/PressableScale": { PressableScale: "PressableScale" },
        "../features/session/ProfileEditSaveButton": { ProfileEditSaveButton: "ProfileEditSaveButton" },
        "../features/session/appLocale": { getAppLocale: () => "en" },
        "../features/session/useProfileEditExitGuard": { useProfileEditExitGuard: () => undefined }
      }
    }
  )
  const props = {
    navigation: { replace: () => undefined, goBack: () => undefined, canGoBack: () => true, addListener: () => () => undefined },
    route: { key: "ProfileEdit", name: "ProfileEdit" },
    currentDisplayName: "Ada",
    currentAge: 25,
    currentBio: "Hello",
    currentGender: "female",
    currentIdentityGender: "female",
    currentDiscoveryPreferences: { ageMin: 18, ageMax: 99, genders: [], vibes: [], radiusKm: STORED_RADIUS_KM },
    currentInterests: [],
    currentPrompts: [],
    onSave: async (input: unknown) => { saved.push(input) }
  }
  const render = () => runtime.render(() => ProfileEditScreen(props))
  render()
  return { runtime, tree: () => collect(runtime.output) }
}

test("profile edit offers no search-distance control", () => {
  const { tree } = renderProfileEdit([])
  const elements = tree()
  const distanceControls = elements.filter((element) =>
    /\bkm\b/i.test(String(element.props.accessibilityLabel ?? "")) || /\bkm\b/i.test(textOf(element)))
  assert.deepEqual(distanceControls.map((element) => element.props.accessibilityLabel ?? textOf(element)), [])
  assert.equal(elements.some((element) => textOf(element) === "Search area"), false)
})

test("using every profile control and saving keeps the stored search distance", async () => {
  const saved: Array<{ discoveryPreferences?: { radiusKm?: number } }> = []
  const { runtime, tree } = renderProfileEdit(saved)
  for (const element of tree().filter((candidate) => candidate.props.accessibilityRole === "radio")) {
    element.props.onPress?.()
    runtime.rerender()
  }
  // Make sure there is a change to save even if no option was pressed.
  const discoveryOption = tree().find((element) => element.props.accessibilityRole === "checkbox")
  discoveryOption?.props.onPress?.()
  runtime.rerender()
  const save = tree().find((element) => element.type === "ProfileEditSaveButton")
  assert.ok(save, "save button not rendered")
  await save.props.onPress()
  assert.equal(saved.length, 1)
  assert.equal(saved[0]?.discoveryPreferences?.radiusKm, STORED_RADIUS_KM)
})
