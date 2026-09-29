import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const navigator = ts.createSourceFile(
  "RootNavigator.tsx",
  readFileSync(resolve(import.meta.dirname, "../../navigation/RootNavigator.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)

function screenExpression(screen: string, prop: string): string {
  let expression: ts.Expression | undefined
  function visit(node: ts.Node): void {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(navigator) === `${screen}.DeferredScreen`
    ) {
      const attribute = node.attributes.properties.find(
        (item): item is ts.JsxAttribute =>
          ts.isJsxAttribute(item) && item.name.getText(navigator) === prop
      )
      if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) {
        assert.equal(expression, undefined, `ambiguous ${screen}.${prop}`)
        expression = attribute.initializer.expression
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(navigator)
  assert.ok(expression, `missing ${screen}.${prop}`)
  return expression.getText(navigator)
}

function evaluate(expression: string, bindings: Record<string, unknown>): unknown {
  const code = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(code, bindings)
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test("profile setup navigates with selected gender while the durable save is pending", async () => {
  const save = deferred()
  const calls: string[] = []
  let navigationParams: { initialGender?: string } | undefined
  const handler = evaluate(screenExpression("profileSetupScreenBundle", "onComplete"), {
    profileMode: "first-completion",
    profileReviewReturnTarget: "RoomSetup",
    completeProfileSetup: () => { calls.push("save"); return save.promise },
    screenProps: {
      navigation: {
        replace: (route: string, params?: { initialGender: string }) => {
          calls.push(route)
          navigationParams = params
        }
      }
    }
  }) as (input: { gender: string }) => Promise<void>

  const completion = handler({ gender: "man" })
  assert.deepEqual(calls, ["save", "AvatarSetup"])
  assert.equal(navigationParams?.initialGender, "man")
  save.resolve()
  await completion
})

test("profile review returns to its requested step after starting the save", async () => {
  const save = deferred()
  const calls: string[] = []
  const handler = evaluate(screenExpression("profileSetupScreenBundle", "onComplete"), {
    profileMode: "review",
    profileReviewReturnTarget: "RoomSetup",
    completeProfileSetup: () => { calls.push("save"); return save.promise },
    screenProps: { navigation: { replace: (route: string) => { calls.push(route) } } }
  }) as (input: { gender: string }) => Promise<void>

  const completion = handler({ gender: "woman" })
  assert.deepEqual(calls, ["save", "RoomSetup"])
  save.resolve()
  await completion
})

test("avatar setup waits for persistence before entering room setup", async () => {
  const save = deferred()
  const calls: string[] = []
  const handler = evaluate(screenExpression("avatarSetupScreenBundle", "onComplete"), {
    completeAvatarSetup: () => { calls.push("save"); return save.promise },
    screenProps: { navigation: { replace: (route: string) => { calls.push(route) } } }
  }) as (avatar: object) => Promise<void>

  const completion = handler({})
  assert.deepEqual(calls, ["save"])
  save.resolve()
  await completion
  assert.deepEqual(calls, ["save", "RoomSetup"])
})

test("avatar first frame prefers the chosen gender and falls back to the saved profile", () => {
  const expression = screenExpression("avatarSetupScreenBundle", "initialGender")
  const choose = (selected: string | undefined) => evaluate(expression, {
    screenProps: { route: { params: selected ? { initialGender: selected } : undefined } },
    sessionActor: { profile: { gender: "woman" } }
  })

  assert.equal(choose("man"), "man")
  assert.equal(choose(undefined), "woman")
})
