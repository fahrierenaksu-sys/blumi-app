import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

const lobbySource = readFileSync(new URL("./LobbyScreen.tsx", import.meta.url), "utf8")
const lobbyFile = ts.createSourceFile("LobbyScreen.tsx", lobbySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const frontDeckSource = readFileSync(new URL("../features/discovery/DiscoveryDeckView.tsx", import.meta.url), "utf8")

function findHeaderAvatar(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(lobbyFile) === "CandidateAvatarPreview") {
    const size = node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(lobbyFile) === "size")
    if (size?.initializer && ts.isJsxExpression(size.initializer) && size.initializer.expression?.getText(lobbyFile) === "48") return node
  }
  let found
  ts.forEachChild(node, (child) => { found ??= findHeaderAvatar(child) })
  return found
}

test("Lobby's decorative 48px avatar yields to the visible front Discover card", () => {
  const headerAvatar = findHeaderAvatar(lobbyFile)
  assert.ok(headerAvatar, "expected the Lobby profile-chip avatar")
  const priority = headerAvatar.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(lobbyFile) === "imagePriority")

  assert.equal(priority?.initializer && ts.isStringLiteral(priority.initializer) ? priority.initializer.text : undefined, "normal")
  assert.match(frontDeckSource, /imagePriority=\{isTop \? "high" : "low"\}/)
})
