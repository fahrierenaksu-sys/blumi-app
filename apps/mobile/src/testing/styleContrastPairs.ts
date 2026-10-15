import ts from "typescript"
import { MIN_CONTRAST, contrastRatio } from "../ui/themeContrast"

/**
 * Finds the text/background pairs that style sources actually draw, so the
 * contrast guard covers code as written rather than a hand-kept list.
 *
 * Inside every `StyleSheet.create({...})` it pairs:
 * - a style that sets both `color` and `backgroundColor`;
 * - a label style with its surface by name: `doneText` with `done`,
 *   `doneButton` (and their `Pressed` variants), `genderButtonTextActive`
 *   with `genderButtonActive`;
 * - a style whose `color` is a theme text token with no background of its
 *   own, which is drawn on the page surface (white). Tokens meant for dark or
 *   pink fills (`textInverted`, `onPrimary`, `night*`) are left to the rules
 *   above.
 * Colours resolve from `#hex` literals, `white`/`black` and `uiTheme.colors.*`;
 * anything computed at run time is left out.
 */

export interface StyleContrastPair {
  readonly file: string
  readonly textStyle: string
  readonly surfaceStyle: string
  readonly foreground: string
  readonly background: string
  readonly minimum: number
  readonly ratio: number
}

interface ResolvedStyle {
  readonly color?: string
  readonly backgroundColor?: string
  readonly colorIsPageText: boolean
}

const PAGE_SURFACE = "#FFFFFF"
const LABEL_WORD = /(Text|Label|Icon|Title|Glyph)(?=[A-Z]|$)/
const SURFACE_SUFFIXES = ["", "Button", "Pill"] as const
const PRESSED_SUFFIXES = ["", "Pressed"] as const
const FILL_TEXT_TOKENS = /^(textInverted|onPrimary|night\w*)$/
const NAMED_COLORS: Readonly<Record<string, string>> = { white: "#FFFFFF", black: "#000000" }

function normaliseHex(value: string): string | undefined {
  const named = NAMED_COLORS[value.toLowerCase()]
  if (named) return named
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase()
  const opaque = /^#([0-9a-f]{6})(ff)?$/i.exec(value)
  return opaque ? `#${opaque[1]}`.toUpperCase() : undefined
}

function resolveColor(node: ts.Expression, tokens: Readonly<Record<string, string>>): { hex?: string; isPageText: boolean } {
  if (ts.isStringLiteralLike(node)) return { hex: normaliseHex(node.text), isPageText: false }
  const token = /^uiTheme\.colors\.(\w+)$/.exec(node.getText())
  if (!token) return { isPageText: false }
  const value = tokens[token[1]]
  return { hex: value ? normaliseHex(value) : undefined, isPageText: !FILL_TEXT_TOKENS.test(token[1]) }
}

function readStyle(object: ts.ObjectLiteralExpression, tokens: Readonly<Record<string, string>>): ResolvedStyle {
  let color: string | undefined
  let backgroundColor: string | undefined
  let colorIsPageText = false
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name.getText()
    if (name === "color") {
      const resolved = resolveColor(property.initializer, tokens)
      color = resolved.hex
      colorIsPageText = resolved.isPageText
    } else if (name === "backgroundColor") {
      backgroundColor = resolveColor(property.initializer, tokens).hex
    }
  }
  return { color, backgroundColor, colorIsPageText }
}

function isStyleSheetCreate(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.getText() === "StyleSheet.create"
}

function readStyleSheets(source: ts.SourceFile, tokens: Readonly<Record<string, string>>): Map<string, ResolvedStyle>[] {
  const sheets: Map<string, ResolvedStyle>[] = []
  const visit = (node: ts.Node) => {
    if (isStyleSheetCreate(node) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const entries = node.arguments[0].properties.flatMap((property) =>
        ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)
          ? [[property.name.getText(), readStyle(property.initializer, tokens)] as const]
          : [])
      sheets.push(new Map(entries))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return sheets
}

/** The surfaces a label style sits on, by name: `xText` → `x`, `xButton`, `xPressed`…; `xTextActive` → `xActive`. */
function namedSurfaces(textStyle: string): string[] {
  const match = LABEL_WORD.exec(textStyle)
  if (!match || match.index === 0) return []
  const base = textStyle.slice(0, match.index)
  const state = textStyle.slice(match.index + match[0].length)
  const states = state ? [state] : PRESSED_SUFFIXES
  return SURFACE_SUFFIXES.flatMap((surface) => states.map((suffix) => base + surface + suffix))
}

function minimumFor(textStyle: string): number {
  if (/Disabled/.test(textStyle)) return MIN_CONTRAST.disabledText
  if (/Icon|Glyph/.test(textStyle)) return MIN_CONTRAST.largeText
  return MIN_CONTRAST.text
}

function pairsInSheet(file: string, sheet: Map<string, ResolvedStyle>): StyleContrastPair[] {
  const pairs: StyleContrastPair[] = []
  const add = (textStyle: string, surfaceStyle: string, foreground: string, background: string) => {
    const minimum = minimumFor(textStyle)
    pairs.push({ file, textStyle, surfaceStyle, foreground, background, minimum, ratio: contrastRatio(foreground, background) })
  }
  for (const [name, style] of sheet) {
    if (!style.color) continue
    if (style.backgroundColor) {
      add(name, name, style.color, style.backgroundColor)
      continue
    }
    const surfaces = namedSurfaces(name).filter((surface) => sheet.get(surface)?.backgroundColor)
    for (const surface of surfaces) add(name, surface, style.color, sheet.get(surface)!.backgroundColor!)
    if (surfaces.length === 0 && style.colorIsPageText) add(name, "page surface", style.color, PAGE_SURFACE)
  }
  return pairs
}

export function findStyleContrastPairs(
  file: string,
  sourceText: string,
  tokens: Readonly<Record<string, string>>
): StyleContrastPair[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  return readStyleSheets(source, tokens).flatMap((sheet) => pairsInSheet(file, sheet))
}
