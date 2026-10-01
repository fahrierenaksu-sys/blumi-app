// Ratchet guards for the rules in docs/quality/ENGINEERING_RULES.md.
// Known debt is listed explicitly and may only shrink. A failure here means a
// change added new debt: fix the code, or, if the exception is justified,
// update the allowlist in the same change and explain why in the commit.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(mobileRoot, "src")

function listProductionSources(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listProductionSources(fullPath))
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

const sources = listProductionSources(srcRoot).map((file) => ({
  path: relative(srcRoot, file).split(sep).join("/"),
  text: readFileSync(file, "utf8")
}))

test("HTTP goes through the shared request client, never a raw fetch", () => {
  const offenders = sources.filter(({ text }) => /(?<![\w.])fetch\(/.test(text)).map(({ path }) => path)
  assert.deepEqual(offenders, [], "use requestJson (deadline, abort, error mapping) instead of fetch()")
})

// An injected `fetcher` called directly skips requestJson's deadline and
// cancellation: room invite send/accept/cancel could stay busy forever
// (2026-10-01). Listed files call their fetcher inside a requestJson wrapper.
const FETCHER_INSIDE_REQUEST_JSON = new Set([
  "features/network/apiClient.ts",
  "features/inventory/economyApi.ts"
])

test("injected fetchers run only inside requestJson", () => {
  const offenders = sources
    .filter(({ text }) => /await fetcher\(/.test(text))
    .map(({ path }) => path)
    .filter((path) => !FETCHER_INSIDE_REQUEST_JSON.has(path))
  assert.deepEqual(offenders, [], "pass the fetcher to requestJson instead of calling it directly")
})

// Per-frame JS loops. Animation must run on the UI thread (Reanimated shared
// values). Existing entries are known debt (see ENGINEERING_RULES.md).
const FRAME_LOOP_DEBT = new Set([
  "features/roomV2/editor/useRoomEditorStageLayout.ts",
  "features/session/OnboardingBrandPrelude.tsx",
  "features/session/register/useRegisterFlowController.ts"
])

test("no new requestAnimationFrame or setInterval loops in production code", () => {
  const offenders = sources
    .filter(({ text }) => /requestAnimationFrame\(|setInterval\(/.test(text))
    .map(({ path }) => path)
    .filter((path) => !FRAME_LOOP_DEBT.has(path))
  assert.deepEqual(offenders, [], "drive motion with Reanimated shared values, not JS timers")
})

// Only the shared reduced-motion source may talk to AccessibilityInfo for
// reduce-motion; everything else uses the shared store/hook.
const REDUCE_MOTION_SOURCES = new Set(["ui/animations.ts"])

test("reduce-motion is read from the shared store only", () => {
  const offenders = sources
    .filter(({ text }) => /AccessibilityInfo\.(?:isReduceMotionEnabled|addEventListener\(\s*["']reduceMotionChanged)/.test(text))
    .map(({ path }) => path)
    .filter((path) => !REDUCE_MOTION_SOURCES.has(path))
  assert.deepEqual(offenders, [], "use the shared reduced-motion hook from ui/animations")
})

// Only the shared reduce-transparency source may name the OS query or event;
// every glass surface reads the shared store/hook.
const REDUCE_TRANSPARENCY_SOURCES = new Set(["ui/reduceTransparency.ts", "ui/reduceTransparencyStore.ts"])

test("reduce-transparency is read from the shared store only", () => {
  const offenders = sources
    .filter(({ text }) => /isReduceTransparencyEnabled|reduceTransparencyChanged/.test(text))
    .map(({ path }) => path)
    .filter((path) => !REDUCE_TRANSPARENCY_SOURCES.has(path))
  assert.deepEqual(offenders, [], "use the shared reduce-transparency hook from ui/reduceTransparency")
})

// Large files are split into feature hooks, views and pure models. Existing
// oversized files may not grow; no new file may exceed the limit.
const MAX_LINES = 800
const OVERSIZED_DEBT = {
  "features/avatarV2/room/avatarRoomCatalog.ts": 1304,
  "features/avatarV2/room/avatarRoomMotionAssets.ts": 1274,
  "features/demo/SwipeableDiscoverCard.tsx": 1148,
  "features/roomV2/state/RoomV2Provider.tsx": 1210,
  "features/roomV2/components/RoomRenderer2D.tsx": 967,
  "navigation/RootNavigator.tsx": 1123,
  "features/session/useSessionState.ts": 1117,
  "screens/MyRoomScreen.tsx": 1082,
  "features/avatarV2/avatarV2Catalog.ts": 949,
  "screens/ProfileEditScreen.tsx": 758,
  "features/session/sessionApi.ts": 847,
  "features/avatarV2/room/avatarRoomSelectors.ts": 825,
  "features/session/OnboardingWorldScene.tsx": 823,
  "ui/primitives.tsx": 812
}

test("production files stay small; oversized debt may only shrink", () => {
  const offenders = []
  for (const { path, text } of sources) {
    const lines = (text.match(/\n/g) ?? []).length
    const cap = OVERSIZED_DEBT[path] ?? MAX_LINES
    if (lines > cap) offenders.push(`${path}: ${lines} > ${cap}`)
  }
  assert.deepEqual(offenders, [], "split screens into feature hooks, views and pure models")
})

// A worklet's default parameters are not captured by the worklet transform,
// so a default that names a variable or import is undefined on the UI thread
// and crashes there (it passes under node tests). Resolve defaults in the body.
test("worklets never use identifiers in default parameters", () => {
  const offenders = []
  const signature = /(?:function\s+\w+|\bconst\s+\w+\s*=\s*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?::[^{=]*)?(?:=>)?\s*\{\s*["']worklet["']/g
  for (const { path, text } of sources) {
    if (!/["']worklet["']/.test(text)) continue
    for (const match of text.matchAll(signature)) {
      for (const initializer of match[1].matchAll(/=\s*([A-Za-z_$][\w$.]*)/g)) {
        if (["true", "false", "null", "undefined"].includes(initializer[1])) continue
        offenders.push(`${path}:${text.slice(0, match.index).split("\n").length} default = ${initializer[1]}`)
      }
    }
  }
  assert.deepEqual(offenders, [], "move the default into the worklet body")
})

const MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS = 0

test("react-hooks/exhaustive-deps suppressions do not grow", () => {
  const count = sources.reduce(
    (total, { text }) => total + (text.match(/eslint-disable(?:-next-line|-line)?\s+react-hooks\/exhaustive-deps/g) ?? []).length,
    0
  )
  assert.ok(
    count <= MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS,
    `${count} suppressions > ${MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS}; fix the dependency list instead`
  )
})
