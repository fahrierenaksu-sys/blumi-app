import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// The Home Studio QA gate depends only on build constants, so its catalog is
// resolved once per mount even though the gate resolver returns a new object.
test("Home Studio resolves its QA catalog once per mount across re-renders", async () => {
  const runtime = createFakeReactRuntime()
  const gateCalls: unknown[] = []
  const catalogCalls: unknown[] = []
  const { HomeStudioScreen } = loadSourceWithFakeReact<{ HomeStudioScreen: (props: unknown) => unknown }>(
    "screens/HomeStudioScreen.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "../features/roomStudio/roomStudioRuntimeGate": {
          resolveRoomStudioRuntimeGate: (input: unknown) => {
            gateCalls.push(input)
            return { enabled: false, canPreview: false, canRotate: false, mode: "disabled", reason: "fixture" }
          }
        },
        "../features/roomStudio/roomStudioQaCatalog": {
          resolveRoomStudioQaCatalog: (gate: unknown) => {
            catalogCalls.push(gate)
            return { enabled: false, catalog: [] }
          }
        },
        "../features/roomStudio/roomStudioPersistence": {
          loadRoomStudioQaDecor: async () => null,
          saveRoomStudioQaDecor: async () => undefined
        },
        "../config/env": {
          BLUMI_BUILD_PROFILE: "production",
          BLUMI_HOME_STUDIO_QA_FLAG: undefined,
          BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED_FLAG: undefined
        }
      },
      inertUnknown: true
    }
  )
  const props = { navigation: { canGoBack: () => false, goBack: () => undefined, replace: () => undefined } }
  runtime.render(() => HomeStudioScreen(props))
  runtime.rerender()
  runtime.rerender()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.ok(runtime.renderCount >= 3)
  assert.equal(catalogCalls.length, 1)
  assert.equal((catalogCalls[0] as { reason: string }).reason, "fixture")
  assert.equal(gateCalls.length, 1)
})
