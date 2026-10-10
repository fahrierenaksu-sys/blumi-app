import assert from "node:assert/strict"
import Module from "node:module"
import test from "node:test"
import { createElement, type ReactElement, type ReactNode } from "react"

// The scope imports React Navigation through `@react-navigation/native`, which
// re-exports core but also loads React Native; node runs it against core.
const moduleWithResolver = Module as unknown as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string
}
const resolveFilename = moduleWithResolver._resolveFilename
moduleWithResolver._resolveFilename = (request, ...rest) =>
  resolveFilename(request === "@react-navigation/native" ? "@react-navigation/core" : request, ...rest)

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderToString } = require("react-dom/server") as { renderToString: (element: ReactElement) => string }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("@react-navigation/core") as typeof import("@react-navigation/core")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const routers = require("@react-navigation/routers") as typeof import("@react-navigation/routers")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MainTabPageFocusScope } = require("./MainTabPageFocusScope") as typeof import("./MainTabPageFocusScope")

function SlotNavigator(props: { children: ReactNode }) {
  const { state, descriptors, NavigationContent } = core.useNavigationBuilder(routers.StackRouter, {
    children: props.children
  })
  const focused = state.routes[state.index]!
  return createElement(NavigationContent, null, descriptors[focused.key]!.render())
}
const Slot = core.createNavigatorFactory(SlotNavigator)()

function FocusProbe() {
  return createElement("span", null, core.useIsFocused() ? "focused" : "unfocused")
}

function renderPage(isPageFocused: boolean): string {
  const pageNavigation = {
    isFocused: () => isPageFocused,
    addListener: () => () => undefined
  }
  // eslint-disable-next-line react/no-children-prop -- the props type requires children
  const SlotScreen = (screen: { route: { key: string } }) => createElement(
    MainTabPageFocusScope,
    {
      navigation: pageNavigation,
      route: { key: `${screen.route.key}:Lobby`, name: "Lobby" },
      slotKey: screen.route.key,
      children: createElement(FocusProbe)
    }
  )
  return renderToString(createElement(
    core.BaseNavigationContainer,
    null,
    createElement(Slot.Navigator, null, createElement(Slot.Screen, { name: "Lobby", component: SlotScreen }))
  ))
}

test("a pager page that is not on screen reads useIsFocused as false while its slot is focused", () => {
  assert.match(renderPage(false), />unfocused</)
})

test("the pager page on screen reads useIsFocused as true", () => {
  assert.match(renderPage(true), />focused</)
})
