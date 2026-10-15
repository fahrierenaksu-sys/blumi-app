import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import { blumiEntryTheme, uiTheme } from "./theme"
import { MIN_CONTRAST, contrastRatio } from "./themeContrast"

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

function blend(foreground: string, background: string, alpha: number): string {
  const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
  const mixed = [0, 1, 2].map((index) => Math.round(channel(foreground, index) * alpha + channel(background, index) * (1 - alpha)))
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

function renderDisabledButton(tone: "default" | "entry") {
  const runtime = createFakeReactRuntime()
  const { PrimaryButton } = loadSourceWithFakeReact<{ PrimaryButton: (props: Record<string, unknown>) => Element }>(
    "ui/primitives.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": createReanimatedStub(runtime).module
      },
      real: ["./theme"],
      inertUnknown: true
    }
  )
  runtime.render(() => PrimaryButton({ label: "Continue", onPress: () => undefined, disabled: true, tone }))
  const button = findElements(runtime.output, (element) => element.props.accessibilityRole === "button")[0]
  const style = typeof button.props.style === "function" ? button.props.style({ pressed: false }) : button.props.style
  const opacity = (flattenStyle(style).opacity as number | undefined) ?? 1
  const fill = (findElements(button, (element) => Array.isArray(element.props.colors))[0].props.colors as string[])[0]
  const label = findElements(button, (element) => element.props.children === "Continue")[0]
  const labelColor = flattenStyle(label.props.style).color as string
  runtime.unmount()
  return { opacity, fill, labelColor }
}

for (const [tone, theme] of [["default", uiTheme], ["entry", blumiEntryTheme]] as const) {
  test(`a disabled ${tone} primary button stays readable as drawn, faded over its page`, () => {
    const { opacity, fill, labelColor } = renderDisabledButton(tone)
    const page = theme.gradients.heroBackground[0]
    const shownFill = blend(fill, page, opacity)
    const shownLabel = blend(labelColor, page, opacity)
    const ratio = contrastRatio(shownLabel, shownFill)
    assert.ok(ratio >= MIN_CONTRAST.disabledText, `${shownLabel} on ${shownFill} = ${ratio.toFixed(2)}:1`)
    assert.notEqual(fill, tone === "entry" ? theme.colors.actionDark : theme.gradients.primary[0], "it still looks disabled")
  })
}
