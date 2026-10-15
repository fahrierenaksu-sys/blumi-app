import assert from "node:assert/strict"
import test from "node:test"
import { createElement, type ReactElement } from "react"
import { createDeferredScreen } from "./deferredScreen"

type SetupStepProps = {
  step: "profile" | "avatar"
  onDone: () => void
}

function SetupStepScreen(props: SetupStepProps): ReactElement | null {
  void props
  return null
}

test("a deferred screen keeps the real screen's props: wrong or missing route params fail to compile", () => {
  const bundle = createDeferredScreen(() => SetupStepScreen)
  const onDone = () => undefined

  createElement(bundle.DeferredScreen, { step: "profile", onDone })
  // @ts-expect-error a param value the screen does not accept is a compile error
  createElement(bundle.DeferredScreen, { step: "shop", onDone })
  // @ts-expect-error a missing required prop is a compile error
  createElement(bundle.DeferredScreen, { step: "avatar" })
  // @ts-expect-error a prop the screen does not declare is a compile error
  createElement(bundle.DeferredScreen, { step: "avatar", onDone, sessionToken: "x" })

  assert.equal(bundle.preload(), SetupStepScreen)
})

test("the first render resolves the real screen synchronously and loads its module once", () => {
  let loads = 0
  const bundle = createDeferredScreen(() => { loads += 1; return SetupStepScreen })
  assert.equal(loads, 0, "nothing loads before the first render or preload")

  const render = bundle.DeferredScreen as (props: SetupStepProps) => ReactElement
  const onDone = () => undefined
  const first = render({ step: "profile", onDone })
  assert.equal(first.type, SetupStepScreen, "the first frame is the real screen, not a fallback")
  assert.deepEqual(first.props, { step: "profile", onDone })
  render({ step: "avatar", onDone })
  assert.equal(bundle.preload(), SetupStepScreen)
  assert.equal(loads, 1, "the screen module loads once and is reused")
})
