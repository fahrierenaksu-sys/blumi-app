import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import * as receiptsModel from "../model/stillDisplayReceipts"

// A Discover card behind the top one draws its chibi without the startup receipt listener; promotion to the top
// card adds it. The still must not be remounted then (it would blank and pop in), and the receipt must still arrive
// although its layers are already on screen and never display again.

const LAYERS = ["female/full/body__o0", "female/full/hair__o4p6"]

function mountReceipts() {
  const runtime = createFakeReactRuntime()
  const { useStillDisplayReceipts } = loadSourceWithFakeReact<{
    useStillDisplayReceipts: (scope: string, assets: readonly string[], onDisplay: (() => void) | undefined) => (asset: string) => void
  }>("features/avatar/components/useStillDisplayReceipts.ts", runtime, {
    modules: { "../model/stillDisplayReceipts": receiptsModel }
  })
  const render = (scope: string, assets: readonly string[], onDisplay?: () => void) =>
    runtime.render(() => useStillDisplayReceipts(scope, assets, onDisplay))
  return { render }
}

test("a still promoted to the top card still reports it displayed", () => {
  const still = mountReceipts()
  const behind = still.render("look-a", LAYERS)
  behind(LAYERS[0])
  behind(LAYERS[1])

  let receipts = 0
  still.render("look-a", LAYERS, () => { receipts += 1 })
  assert.equal(receipts, 1, "the receipt arrives for layers already on screen")
})

test("the receipt waits for every layer and starts over for a different look", () => {
  const still = mountReceipts()
  let receipts = 0
  const onDisplay = () => { receipts += 1 }
  const first = still.render("look-a", LAYERS, onDisplay)
  first(LAYERS[0])
  assert.equal(receipts, 0, "one layer is not the whole chibi")

  const changed = still.render("look-b", LAYERS, onDisplay)
  changed(LAYERS[1])
  assert.equal(receipts, 0, "receipts of the previous look do not count")
  changed(LAYERS[0])
  assert.equal(receipts, 1)
})

test("a still with no layers never reports", () => {
  const still = mountReceipts()
  let receipts = 0
  still.render("empty", [], () => { receipts += 1 })
  assert.equal(receipts, 0)
})
