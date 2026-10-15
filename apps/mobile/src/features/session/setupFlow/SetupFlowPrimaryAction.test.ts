import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../../testing/hookHarness"
import { MIN_CONTRAST, contrastRatio } from "../../../ui/themeContrast"

type Element = { type: unknown; props: Record<string, any> }

function findElements(node: unknown, matches: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, matches, found))
    return found
  }
  if (!node || typeof node !== "object") return found
  const element = node as Element
  if (element.props && matches(element)) found.push(element)
  findElements(element.props?.children, matches, found)
  return found
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  return style && typeof style === "object" ? style as Record<string, unknown> : {}
}

function mountAction(label: string, disabled = false) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const { SetupFlowPrimaryAction } = loadSourceWithFakeReact<{
    SetupFlowPrimaryAction: (props: Record<string, unknown>) => Element
  }>("features/session/setupFlow/SetupFlowPrimaryAction.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated.module
    },
    real: ["../../../ui/theme", "../onboardingActionLayout"],
    inertUnknown: true
  })
  runtime.render(() => SetupFlowPrimaryAction({ label, onPress: () => undefined, disabled, busy: false }))
  return runtime
}

test("the onboarding primary action label follows the user's text size and wraps", () => {
  const runtime = mountAction("Devam et")
  const labels = findElements(runtime.output, (element) => element.props.children === "Devam et")
  assert.equal(labels.length, 1)
  const label = labels[0].props
  assert.equal(label.maxFontSizeMultiplier, undefined, "no text size cap")
  assert.equal(label.numberOfLines, undefined, "the label may wrap")
  assert.equal(label.adjustsFontSizeToFit, undefined, "the label is never shrunk to fit")
  runtime.unmount()
})

test("the onboarding primary action grows with its label instead of clipping it", () => {
  const runtime = mountAction("Devam et")
  const button = findElements(runtime.output, (element) => element.props.accessibilityRole === "button")[0]
  assert.ok(button, "the action is a button")
  const boxes = [button, ...findElements(button.props.children, (element) => element.props.style !== undefined)]
  for (const box of boxes) {
    const style = flattenStyle(box.props.style)
    assert.equal(style.height, undefined, "no fixed height can hide a wrapped label")
  }
  assert.equal(flattenStyle(button.props.style).minHeight, 58, "the designed height stays the minimum")
  runtime.unmount()
})

function readActionColors(disabled: boolean) {
  const runtime = mountAction("Devam et", disabled)
  const label = findElements(runtime.output, (element) => element.props.children === "Devam et")[0]
  const surface = findElements(runtime.output, (element) => Array.isArray(element.props.colors))[0]
  const colors = { label: flattenStyle(label.props.style).color as string, fills: surface.props.colors as string[] }
  runtime.unmount()
  return colors
}

test("a disabled onboarding action keeps a readable label and still looks disabled", () => {
  const enabled = readActionColors(false)
  const disabled = readActionColors(true)
  for (const fill of disabled.fills) {
    assert.ok(contrastRatio(disabled.label, fill) >= MIN_CONTRAST.disabledText,
      `${disabled.label} on ${fill} = ${contrastRatio(disabled.label, fill).toFixed(2)}:1`)
  }
  assert.ok(contrastRatio(disabled.fills[0], enabled.fills[0]) > 1.5, "the disabled fill is clearly lighter than the enabled one")
})
