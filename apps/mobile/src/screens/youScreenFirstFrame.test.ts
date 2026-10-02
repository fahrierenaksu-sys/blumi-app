import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// "Profilim" opens by a push: the whole page must be there on the push's
// first frame, with nothing waiting on an entrance animation.
type Element = { type: unknown; props: Record<string, any> }

function collect(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found)
    return found
  }
  if (!node || typeof node !== "object" || !("props" in node)) return found
  const element = node as Element
  found.push(element)
  collect(element.props.children, found)
  return found
}

test("the own profile draws every section on its first frame, without an entrance", () => {
  const runtime = createFakeReactRuntime()
  const sections = {
    ProfileAddCard: "ProfileAddCard",
    ProfileBioCard: "ProfileBioCard",
    ProfileInterestChips: "ProfileInterestChips",
    ProfilePreviewEntry: "ProfilePreviewEntry",
    ProfilePromptCards: "ProfilePromptCards",
    ProfileSection: "ProfileSection"
  }
  const { YouScreen } = loadSourceWithFakeReact<{ YouScreen: (props: unknown) => unknown }>(
    "screens/YouScreen.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": {
          __esModule: true,
          default: { ScrollView: "Reanimated.ScrollView" },
          useSharedValue: (value: number) => ({ value }),
          useAnimatedScrollHandler: () => () => undefined
        },
        "../ui/layout/PageContainer": { PageSafeArea: "PageSafeArea" },
        "../features/session/authLocale": { getAppLocale: () => "en" },
        "../features/profile/profileCopy": { getOwnProfileCopy: () => new Proxy({}, { get: (_t, key) => String(key) }) },
        "../features/profile/profileViewModel": {
          resolveOwnProfileSections: () => ({
            completeness: { score: 1 },
            bio: "Hello",
            interests: ["Tea"],
            showAddInterests: false,
            prompts: [{ question: "q", answer: "a" }],
            showAddPrompt: false
          })
        },
        "../features/profile/OwnProfileHero": { OwnProfileHero: "OwnProfileHero" },
        "../features/profile/OwnProfileIdentity": { OwnProfileIdentity: "OwnProfileIdentity" },
        "../features/profile/ProfileCompletenessCard": { ProfileCompletenessCard: "ProfileCompletenessCard" },
        "../features/profile/OwnProfileSections": sections,
        "../navigation/rootNavigationModel": { goBackOrFallback: () => undefined },
        "../ui/theme": { uiTheme: { colors: { background: "#fff", primary: "#f0f" }, spacing: { xl: 1, xxl: 2 } } },
        "../ui/vibeTilePicker": { VIBE_PRESETS: [] }
      }
    }
  )
  const output = runtime.render(() => YouScreen({
    navigation: { navigate: () => undefined, replace: () => undefined },
    route: { key: "You", name: "You" },
    sessionActor: { profile: { userId: "viewer-1", displayName: "Me", age: 27, avatar: { presetId: "none" } } },
    onResetSession: () => undefined
  }))
  const elements = collect(output)
  const types = new Set(elements.map((element) => element.type))
  for (const expected of [
    "OwnProfileHero",
    "OwnProfileIdentity",
    "ProfileCompletenessCard",
    "ProfileBioCard",
    "ProfileInterestChips",
    "ProfilePromptCards",
    "ProfilePreviewEntry"
  ]) assert.ok(types.has(expected), `${expected} is on the first frame`)
  assert.deepEqual(elements.filter((element) => element.props.entering !== undefined), [])
})
