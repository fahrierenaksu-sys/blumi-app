import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { findPerFrameJsWork } from "../testing/gestureFrameWorkGuard.mjs"

// The swipe-dismiss sheet's drag runs on the UI thread: no JS work on any
// drag or scroll frame. The tree-wide form of this guard lives in
// src/ui/gestureFrameWork.test.mjs; the release, backdrop and Reduce Motion
// exit rules are behavior-tested in sheetDismissModel.test.ts.
// This file stays because apps/mobile/package.json test:accessibility lists
// it; delete it together with that entry at the next native build.
const sourceRoot = fileURLToPath(new URL("..", import.meta.url))

test("the bottom sheet drag never schedules JS work per frame", () => {
  const files = [
    "ui/SwipeDismissSheet.tsx",
    "components/ReportModal.tsx",
    "components/DiscoverFiltersBottomSheet.tsx",
    "features/shop/screen/ShopCheckoutSheet.tsx"
  ].map((path) => fileURLToPath(new URL(`../${path}`, import.meta.url)))
  assert.deepEqual(findPerFrameJsWork(files, sourceRoot), [])
})
