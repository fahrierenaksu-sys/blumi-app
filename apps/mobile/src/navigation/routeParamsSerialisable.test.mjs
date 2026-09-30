import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"

// Route params must stay serialisable: functions and class instances break
// navigation state persistence, deep links and restoration (ENGINEERING_RULES
// "Route params carry serialisable data only"). This guard type-checks
// RootStackParamList with the app's real compiler options and walks every
// param type, so a function reached through an imported type fails too.
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const navigatorPath = resolve(mobileRoot, "src/navigation/RootNavigator.tsx")

function loadParamList() {
  const configPath = resolve(mobileRoot, "tsconfig.json")
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, mobileRoot)
  const program = ts.createProgram([navigatorPath], { ...parsed.options, noEmit: true })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(navigatorPath)
  assert.ok(source, "RootNavigator.tsx must be readable")
  const alias = source.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "RootStackParamList"
  )
  assert.ok(alias, "RootNavigator.tsx must declare RootStackParamList")
  return { checker, type: checker.getTypeAtLocation(alias.name) }
}

/** Returns the property paths whose type is callable or constructible. */
function findNonSerialisablePaths(checker, type, path, seen, found) {
  if (type.isUnion() || type.isIntersection()) {
    for (const member of type.types) findNonSerialisablePaths(checker, member, path, seen, found)
    return found
  }
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
    found.push(path)
    return found
  }
  if (!(type.flags & ts.TypeFlags.Object) || seen.has(type)) return found
  seen.add(type)
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const element of checker.getTypeArguments(type)) {
      findNonSerialisablePaths(checker, element, `${path}[]`, seen, found)
    }
    return found
  }
  for (const property of type.getProperties()) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    if (!declaration) continue
    if (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration)) {
      found.push(`${path}.${property.name}`)
      continue
    }
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration)
    findNonSerialisablePaths(checker, propertyType, `${path}.${property.name}`, seen, found)
  }
  return found
}

test("RootStackParamList declares no function-typed or constructible route params", () => {
  const { checker, type } = loadParamList()
  const routes = type.getProperties()
  assert.ok(routes.some((route) => route.name === "ChatThread"), "the guard must see the ChatThread route")
  const offenders = []
  for (const route of routes) {
    const routeType = checker.getTypeOfSymbolAtLocation(route, route.valueDeclaration ?? route.declarations[0])
    findNonSerialisablePaths(checker, routeType, route.name, new Set(), offenders)
  }
  assert.deepEqual(offenders, [], `route params must be serialisable; found: ${offenders.join(", ")}`)
})
