import assert from "node:assert/strict"
import test from "node:test"
import { blumiEntryTheme, uiTheme } from "./theme"
import { MIN_CONTRAST, contrastRatio, themeTextPairs } from "./themeContrast"

test("contrast follows the WCAG formula at its known end points", () => {
  assert.equal(contrastRatio("#FFFFFF", "#000000"), 21)
  assert.equal(contrastRatio("#777777", "#777777"), 1)
  assert.throws(() => contrastRatio("rgba(0,0,0,0.5)", "#FFFFFF"))
})

for (const [name, theme] of [["app", uiTheme], ["entry", blumiEntryTheme]] as const) {
  test(`every themed text/background pair in the ${name} theme is readable`, () => {
    const failures = themeTextPairs(theme).flatMap((pair) => pair.backgrounds
      .map((background) => ({ pair, background, ratio: contrastRatio(pair.foreground, background) }))
      .filter(({ pair: { role }, ratio }) => ratio < MIN_CONTRAST[role])
      .map(({ pair: { use, foreground }, background, ratio }) => `${use}: ${foreground} on ${background} = ${ratio.toFixed(2)}:1`))
    assert.deepEqual(failures, [])
  })

  test(`a disabled pink action in the ${name} theme looks different from an enabled one`, () => {
    assert.notEqual(theme.colors.primaryDisabled, theme.colors.primary)
    assert.ok(contrastRatio(theme.colors.primaryDisabled, theme.colors.primary) > 1.2)
  })
}
