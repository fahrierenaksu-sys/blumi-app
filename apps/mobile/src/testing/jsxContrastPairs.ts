import ts from "typescript"
import { MIN_CONTRAST, contrastRatio } from "../ui/themeContrast"
import { type ThemeTables, resolveColor, themeTablesFor } from "./styleContrastPairs"

/**
 * Finds the text/background pairs that JSX draws with colours written in the
 * element itself, the part `findStyleContrastPairs` cannot see.
 *
 * Candidates are text elements (`Text`, `AnimatedText`, `TextInput`) whose
 * `style` sets a `color`, and icon elements (`Ionicons`…) with a `color` prop.
 * A colour is known when it is a `#hex` literal, a theme token
 * (`uiTheme.colors.x`, resolved through the table of the theme the file
 * imports), a top-level `const` holding one of those, or a `StyleSheet.create` entry
 * referenced as `styles.x`; `cond ? a : b`, `cond && a` and style arrays are
 * checked in every variant. The background is the element's own
 * `backgroundColor`, else the nearest ancestor that sets one, walking only
 * through plain containers (`View`, `Pressable`…) inside one component.
 * Anything else (props, functions, gradients, images, custom components,
 * transparency) makes the element skipped, and skips are counted.
 */

export interface JsxContrastPair {
  readonly file: string
  readonly line: number
  readonly tag: string
  readonly foreground: string
  readonly background: string
  readonly minimum: number
  readonly ratio: number
}

export interface JsxContrastScan {
  readonly pairs: readonly JsxContrastPair[]
  readonly checkedElements: number
  /** Elements with a colour of their own whose text colour could not be read statically. */
  readonly skippedForeground: number
  /** Elements whose text colour is known but whose surface is not (props, gradients, images, custom components, the page). */
  readonly skippedBackground: number
}

const DYNAMIC = "dynamic"
const TRANSPARENT = "transparent"
type ColorValue = string | undefined
/** Which way each `cond ? a : b` / `cond && a` went, so a label's variant is only judged against the surface of the same branch. */
type Choices = Readonly<Record<string, boolean>>
interface StyleColors { readonly color?: ColorValue; readonly backgroundColor?: ColorValue; readonly choices?: Choices }
interface Alternative { readonly value: ColorValue; readonly choices: Choices }
interface Background { readonly value: string; readonly choices: Choices }

const TEXT_TAG = /(^|\.)(Text|AnimatedText|TextInput)$/
const ICON_TAG = /^(Ionicons|MaterialIcons|MaterialCommunityIcons|Feather|FontAwesome5?|AntDesign|Entypo)$/
const CONTAINER_TAG = /^(View|Animated\.View|Pressable|PressableScale|TouchableOpacity|SafeAreaView|ScrollView|Text|Animated\.Text|AnimatedText)$/
const MAX_VARIANTS = 16
const UNKNOWN_STYLE: StyleColors = { color: DYNAMIC, backgroundColor: DYNAMIC }

interface FileContext {
  readonly tables: ThemeTables
  readonly constants: ReadonlyMap<string, string>
  readonly sheets: ReadonlyMap<string, ReadonlyMap<string, StyleColors>>
}

const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) ? unwrap(node.expression) : node

function colorValue(node: ts.Expression, context: FileContext): ColorValue {
  const expression = unwrap(node)
  if (ts.isStringLiteralLike(expression) && expression.text === TRANSPARENT) return TRANSPARENT
  if (ts.isIdentifier(expression) && context.constants.has(expression.text)) return context.constants.get(expression.text)
  return resolveColor(expression, context.tables).hex ?? DYNAMIC
}

function colorAlternatives(node: ts.Expression, context: FileContext): Alternative[] {
  const expression = unwrap(node)
  if (ts.isConditionalExpression(expression)) {
    const condition = expression.condition.getText()
    const branch = (value: ts.Expression, taken: boolean) =>
      colorAlternatives(value, context).flatMap((alternative) => {
        const choices = joinChoices(alternative.choices, { [condition]: taken })
        return choices ? [{ value: alternative.value, choices }] : []
      })
    return [...branch(expression.whenTrue, true), ...branch(expression.whenFalse, false)]
  }
  return [{ value: colorValue(expression, context), choices: {} }]
}

function readObjectStyle(object: ts.ObjectLiteralExpression, context: FileContext): StyleColors {
  let style: StyleColors = {}
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      style = { ...style, ...UNKNOWN_STYLE }
    } else if (ts.isPropertyAssignment(property)) {
      const name = property.name.getText()
      if (name === "color" || name === "backgroundColor") style = { ...style, [name]: colorValue(property.initializer, context) }
    }
  }
  return style
}

/** The two sets of choices together, or undefined when they disagree about a condition. */
function joinChoices(first: Choices = {}, second: Choices = {}): Choices | undefined {
  for (const [condition, taken] of Object.entries(second)) {
    if (condition in first && first[condition] !== taken) return undefined
  }
  return { ...first, ...second }
}

const withChoice = (variant: StyleColors, condition: string, taken: boolean): StyleColors | undefined => {
  const choices = joinChoices(variant.choices, { [condition]: taken })
  return choices ? { ...variant, choices } : undefined
}

const defined = <T,>(values: readonly (T | undefined)[]): T[] => values.filter((value): value is T => value !== undefined)

function merge(base: StyleColors, next: StyleColors): StyleColors | undefined {
  const choices = joinChoices(base.choices, next.choices)
  if (!choices) return undefined
  return { color: next.color ?? base.color, backgroundColor: next.backgroundColor ?? base.backgroundColor, choices }
}

function crossMerge(lists: readonly (readonly StyleColors[])[]): StyleColors[] {
  return lists.reduce<StyleColors[]>(
    (merged, variants) => defined(merged.flatMap((base) => variants.map((next) => merge(base, next)))).slice(0, MAX_VARIANTS),
    [{}]
  )
}

/** Every style the expression can produce, as colour-only variants. */
function styleVariants(node: ts.Expression, context: FileContext): StyleColors[] {
  const expression = unwrap(node)
  if (ts.isObjectLiteralExpression(expression)) return [readObjectStyle(expression, context)]
  if (ts.isArrayLiteralExpression(expression)) {
    return crossMerge(expression.elements.map((element) => styleVariants(element as ts.Expression, context)))
  }
  if (ts.isConditionalExpression(expression)) {
    const condition = expression.condition.getText()
    return [
      ...defined(styleVariants(expression.whenTrue, context).map((variant) => withChoice(variant, condition, true))),
      ...defined(styleVariants(expression.whenFalse, context).map((variant) => withChoice(variant, condition, false)))
    ]
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      const condition = expression.left.getText()
      return [
        { choices: { [condition]: false } },
        ...defined(styleVariants(expression.right, context).map((variant) => withChoice(variant, condition, true)))
      ]
    }
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return [...styleVariants(expression.left, context), ...styleVariants(expression.right, context)]
    }
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) return [{}]
  if (ts.isIdentifier(expression) && expression.text === "undefined") return [{}]
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const entry = context.sheets.get(expression.expression.text)?.get(expression.name.text)
    if (entry) return [entry]
  }
  return [UNKNOWN_STYLE]
}

function readFileContext(source: ts.SourceFile, tables: ThemeTables): FileContext {
  const constants = new Map<string, string>()
  const sheets = new Map<string, Map<string, StyleColors>>()
  const base: FileContext = { tables, constants, sheets }
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const initializer = unwrap(declaration.initializer)
      const constant = resolveColor(initializer, tables).hex
      if (constant) {
        constants.set(declaration.name.text, constant)
      } else if (ts.isCallExpression(initializer) && initializer.expression.getText() === "StyleSheet.create") {
        const argument = initializer.arguments[0]
        if (!argument || !ts.isObjectLiteralExpression(argument)) continue
        const entries = argument.properties.flatMap((property) =>
          ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)
            ? [[property.name.getText(), readObjectStyle(property.initializer, base)] as const]
            : [])
        sheets.set(declaration.name.text, new Map(entries))
      }
    }
  }
  return base
}

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined {
  for (const property of element.attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== name) continue
    const initializer = property.initializer
    if (initializer && ts.isJsxExpression(initializer)) return initializer.expression
    if (initializer && ts.isStringLiteral(initializer)) return initializer
  }
  return undefined
}

const styleOf = (element: ts.JsxOpeningLikeElement, context: FileContext): StyleColors[] => {
  const style = attribute(element, "style")
  return style ? styleVariants(style, context) : [{}]
}

/** The JSX element that contains this one, or DYNAMIC-marking `undefined` when a component boundary is crossed first. */
function parentElement(element: ts.JsxOpeningLikeElement): ts.JsxOpeningLikeElement | undefined {
  let node: ts.Node = ts.isJsxOpeningElement(element) ? element.parent : element
  for (node = node.parent; node; node = node.parent) {
    if (ts.isJsxElement(node)) return node.openingElement
    const isComponentBoundary = ts.isFunctionDeclaration(node) ||
      ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !ts.isCallExpression(node.parent) && !ts.isJsxExpression(node.parent))
    if (isComponentBoundary || ts.isSourceFile(node)) return undefined
  }
  return undefined
}

function backgroundsBehind(element: ts.JsxOpeningLikeElement, context: FileContext, isSelf: boolean): Background[] {
  if (!isSelf && !CONTAINER_TAG.test(element.tagName.getText())) return [{ value: DYNAMIC, choices: {} }]
  const found: Background[] = []
  const transparent: Choices[] = []
  for (const style of styleOf(element, context)) {
    const choices = style.choices ?? {}
    if (!style.backgroundColor || style.backgroundColor === TRANSPARENT) transparent.push(choices)
    else found.push({ value: style.backgroundColor, choices })
  }
  if (transparent.length === 0) return found
  const parent = parentElement(element)
  const above = parent ? backgroundsBehind(parent, context, false) : [{ value: DYNAMIC, choices: {} }]
  const carried = above.flatMap((background) =>
    defined(transparent.map((choices) => {
      const joined = joinChoices(choices, background.choices)
      return joined ? { value: background.value, choices: joined } : undefined
    })))
  return [...found, ...carried]
}

function foregroundsOf(element: ts.JsxOpeningLikeElement, context: FileContext): { values: Alternative[]; minimum: number } | undefined {
  const tag = element.tagName.getText()
  if (TEXT_TAG.test(tag)) {
    const values = styleOf(element, context).map((style) => ({ value: style.color, choices: style.choices ?? {} }))
    return values.some((alternative) => alternative.value !== undefined) ? { values, minimum: MIN_CONTRAST.text } : undefined
  }
  if (ICON_TAG.test(tag)) {
    const color = attribute(element, "color")
    return color ? { values: colorAlternatives(color, context), minimum: MIN_CONTRAST.largeText } : undefined
  }
  return undefined
}

function judgeElement(file: string, source: ts.SourceFile, element: ts.JsxOpeningLikeElement, context: FileContext) {
  const foregrounds = foregroundsOf(element, context)
  if (!foregrounds) return undefined
  const tag = element.tagName.getText()
  const line = source.getLineAndCharacterOfPosition(element.getStart()).line + 1
  const backgrounds = backgroundsBehind(element, context, true)
  const pairs = new Map<string, JsxContrastPair>()
  let isForegroundUnknown = false
  let isBackgroundUnknown = false
  for (const { value: foreground, choices: foregroundChoices } of foregrounds.values) {
    if (foreground === undefined) continue
    for (const { value: background, choices: backgroundChoices } of backgrounds) {
      if (!joinChoices(foregroundChoices, backgroundChoices)) continue
      if (foreground === DYNAMIC || foreground === TRANSPARENT) isForegroundUnknown = true
      else if (background === DYNAMIC) isBackgroundUnknown = true
      else pairs.set(`${foreground}@${background}`, { file, line, tag, foreground, background, minimum: foregrounds.minimum, ratio: contrastRatio(foreground, background) })
    }
  }
  return { pairs: [...pairs.values()], isForegroundUnknown, isBackgroundUnknown }
}

export function findJsxContrastPairs(
  file: string,
  sourceText: string,
  tokens: Readonly<Record<string, string>>,
  entryTokens: Readonly<Record<string, string>> = tokens
): JsxContrastScan {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const context = readFileContext(source, themeTablesFor(source, tokens, entryTokens))
  const pairs: JsxContrastPair[] = []
  let checkedElements = 0
  let skippedForeground = 0
  let skippedBackground = 0
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const judged = judgeElement(file, source, node, context)
      if (judged) {
        pairs.push(...judged.pairs)
        if (judged.pairs.length > 0) checkedElements += 1
        if (judged.isForegroundUnknown) skippedForeground += 1
        if (judged.isBackgroundUnknown) skippedBackground += 1
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { pairs, checkedElements, skippedForeground, skippedBackground }
}
