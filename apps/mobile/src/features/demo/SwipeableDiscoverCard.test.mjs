import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./SwipeableDiscoverCard.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("SwipeableDiscoverCard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const card = file.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === "SwipeableDiscoverCard"
)

// Execute the real component expressions; these checks do not simulate native paint.
function expression(name, bindings) {
  const declaration = card.body.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === name)
  assert.ok(declaration?.initializer)
  const executable = ts.transpileModule(`(${declaration.initializer.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(executable, bindings)
}

function callback(name, bindings) {
  const declaration = card.body.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === name)
  assert.ok(declaration?.initializer && ts.isCallExpression(declaration.initializer))
  const executable = ts.transpileModule(`(${declaration.initializer.arguments[0].getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(executable, bindings)
}

test("a deck card is visible at its first commit, before passive effects", () => {
  for (const [disableEntryAnim, reduceMotion, expected] of [
    [true, false, 1], [true, true, 1], [false, true, 1], [false, false, 0]
  ]) {
    const initial = expression("entryAnim", {
      disableEntryAnim,
      reduceMotion,
      useRef: (value) => ({ current: value }),
      Animated: { Value: class { constructor(value) { this.value = value } } }
    })
    assert.equal(initial.value, expected)
  }
})

test("an interrupted swipe never submits a like or pass", () => {
  let onAnimationEnd
  const delivered = []
  const forceSwipe = callback("forceSwipe", {
    useCallback: (fn) => fn,
    Animated: { timing: () => ({ start: (handler) => { onAnimationEnd = handler } }) },
    position: {},
    reduceMotion: false,
    SWIPE_OUT_DURATION: 200,
    Easing: { out: () => undefined, cubic: undefined },
    screenWidth: 400,
    profile: { userId: "candidate" },
    onSwipeRight: (id) => delivered.push(`like:${id}`),
    onSwipeLeft: (id) => delivered.push(`pass:${id}`)
  })
  forceSwipe("right")
  onAnimationEnd({ finished: false })
  assert.deepEqual(delivered, [])
  forceSwipe("left")
  onAnimationEnd({ finished: true })
  assert.deepEqual(delivered, ["pass:candidate"])
})

test("unrelated card renders reuse the snapshot but a new appearance invalidates it", () => {
  let memo
  let calls = 0
  const bindings = {
    profile: { userId: "candidate", displayName: "Candidate", avatarPresetId: "preset", avatar: { loadout: {} } },
    createCandidateAvatarSnapshot: (input) => { calls += 1; return { ...input } },
    useMemo: (factory, dependencies) => {
      if (!memo || dependencies.some((value, index) => !Object.is(value, memo.dependencies[index]))) {
        memo = { value: factory(), dependencies }
      }
      return memo.value
    }
  }
  const first = expression("avatarSnapshot", bindings)
  bindings.profile = { ...bindings.profile, bio: "changed copy" }
  assert.equal(expression("avatarSnapshot", bindings), first)
  assert.equal(calls, 1)
  for (const field of ["avatar", "avatarPresetId", "userId", "displayName"]) {
    const previous = expression("avatarSnapshot", bindings)
    bindings.profile = { ...bindings.profile, [field]: field === "avatar" ? { loadout: { top: "new" } } : `new-${field}` }
    assert.notEqual(expression("avatarSnapshot", bindings), previous)
  }
  assert.equal(calls, 5)
})

test("the card surface uses the avatar image cache without a fade or intrinsic-size layout", () => {
  let surface
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.attributes.properties.some((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "source" &&
      attribute.initializer?.getText(file) === "{discoverCardSurface}"
    )) surface = node
    ts.forEachChild(node, visit)
  }
  visit(card)
  assert.ok(surface)
  assert.equal(surface.tagName.getText(file), "ExpoImage")
  const attributes = Object.fromEntries(surface.attributes.properties.map((attribute) => [
    attribute.name.getText(file), attribute.initializer?.getText(file)
  ]))
  assert.equal(attributes.cachePolicy, '"memory-disk"')
  assert.equal(attributes.contentFit, '"cover"')
  assert.equal(attributes.priority, "{imagePriority}")
  assert.equal(attributes.transition, "{0}")
  assert.equal(attributes.style, "{StyleSheet.absoluteFill}")
  const priorityAttribute = surface.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "priority"
  )
  const evaluatePriority = (imagePriority) => {
    const executable = ts.transpileModule(`(${priorityAttribute.initializer.expression.getText(file)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
    return runInNewContext(executable, { imagePriority })
  }
  assert.equal(evaluatePriority("high"), "high")
  assert.equal(evaluatePriority("low"), "low")
  assert.match(source, /card:\s*\{[^}]*backgroundColor:\s*uiTheme\.ambientGlass\.surface/s)
})

test("the front card and avatar outrank preloaded cards and hidden flip content", () => {
  const deckSource = readFileSync(new URL("../discovery/DiscoveryDeckView.tsx", import.meta.url), "utf8")
  const deckFile = ts.createSourceFile("DiscoveryDeckView.tsx", deckSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let deckCard
  function visitDeck(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(deckFile) === "SwipeableDiscoverCard") deckCard = node
    ts.forEachChild(node, visitDeck)
  }
  visitDeck(deckFile)
  assert.ok(deckCard)
  const deckPriority = deckCard.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(deckFile) === "imagePriority"
  )
  assert.ok(deckPriority?.initializer && ts.isJsxExpression(deckPriority.initializer))
  const deckPriorityExpression = ts.transpileModule(`(${deckPriority.initializer.expression.getText(deckFile)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  const cardPriority = (isTop) => runInNewContext(deckPriorityExpression, { isTop })
  assert.equal(cardPriority(true), "high")
  assert.equal(cardPriority(false), "low")

  const previews = []
  function visitPreviews(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "CandidateAvatarPreview") previews.push(node)
    ts.forEachChild(node, visitPreviews)
  }
  visitPreviews(file)
  assert.equal(previews.length, 2)
  const priorityExpression = (preview) => {
    const attribute = preview.attributes.properties.find((entry) =>
      ts.isJsxAttribute(entry) && entry.name.getText(file) === "imagePriority"
    )
    assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer))
    return ts.transpileModule(`(${attribute.initializer.expression.getText(file)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
  }
  assert.equal(runInNewContext(priorityExpression(previews[0]), { imagePriority: cardPriority(true) }), "high")
  assert.equal(runInNewContext(priorityExpression(previews[0]), { imagePriority: cardPriority(false) }), "low")
  const backPriorityAttribute = [...card.getChildren()].flatMap((node) => {
    const matches = []
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "DiscoveryCardBack") matches.push(node)
      ts.forEachChild(node, visit)
    }
    visit(node)
    return matches
  })[0]?.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "imagePriority"
  )
  assert.ok(backPriorityAttribute?.initializer && ts.isJsxExpression(backPriorityAttribute.initializer))
  const backPriority = ts.transpileModule(`(${backPriorityAttribute.initializer.expression.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  assert.equal(runInNewContext(backPriority, { imagePriority: "high", isBackVisible: false }), "low")
  assert.equal(runInNewContext(backPriority, { imagePriority: "high", isBackVisible: true }), "high")
  assert.equal(runInNewContext(backPriority, { imagePriority: "low", isBackVisible: true }), "low")
  assert.equal(runInNewContext(priorityExpression(previews[1]), { imagePriority: "high" }), "high")
})

test("the authorized showcase query is enabled only for the current viewer and flip", () => {
  const captured = []
  const authorization = {
    id: 2,
    baseHttpUrl: "https://api.test",
    viewerUserId: "viewer-1",
    candidateUserId: "candidate-1",
    sessionToken: "session-secret"
  }
  const bindings = {
    profile: { userId: "candidate-1" },
    showcaseRequest: {
      baseHttpUrl: "https://api.test",
      viewerUserId: "viewer-1",
      sessionToken: "session-secret"
    },
    showcaseAuthorization: authorization,
    buildDiscoveryRoomShowcaseQueryKey: (input) => input,
    createDiscoveryRoomShowcaseQueryOptions: (input) => input,
    useQuery: (options) => { captured.push(options); return { data: undefined } }
  }

  const frontMatches = expression("authorizationMatches", { ...bindings, isBackVisible: false })
  expression("showcaseQuery", { ...bindings, authorizationMatches: frontMatches })
  const backMatches = expression("authorizationMatches", { ...bindings, isBackVisible: true })
  expression("showcaseQuery", { ...bindings, authorizationMatches: backMatches })
  const changedSessionMatches = expression("authorizationMatches", {
    ...bindings,
    isBackVisible: true,
    showcaseRequest: { ...bindings.showcaseRequest, sessionToken: "rotated-session" }
  })
  expression("showcaseQuery", { ...bindings, authorizationMatches: changedSessionMatches })

  assert.equal(captured[0].enabled, false)
  assert.equal(captured[1].enabled, true)
  assert.equal(captured[2].enabled, false)
  assert.equal(captured[1].authorizationId, 2)
  assert.equal(captured[1].viewerUserId, "viewer-1")
  assert.equal(captured[1].candidateUserId, "candidate-1")
  assert.equal(captured[1].sessionToken, "session-secret")
})

test("old room data is hidden while another viewer or flip is awaiting authorization", () => {
  const oldRoom = { roomHeadline: "Old room", roomSnapshotUrl: "/old-image" }
  assert.equal(expression("authorizedShowcase", {
    authorizationMatches: false,
    showcaseQuery: { isSuccess: true, data: oldRoom }
  }), undefined)
  assert.equal(expression("authorizedShowcase", {
    authorizationMatches: true,
    showcaseQuery: { isSuccess: false, data: oldRoom }
  }), undefined)
  assert.equal(expression("authorizedShowcase", {
    authorizationMatches: true,
    showcaseQuery: { isSuccess: true, isFetching: true, data: oldRoom }
  }), undefined)
})

test("a server-backed card never falls back to stale profile room text or image", () => {
  let backFace
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "DiscoveryCardBack") {
      backFace = node
    }
    ts.forEachChild(node, visit)
  }
  visit(card)
  assert.ok(backFace)
  const attributeValue = (name, bindings) => {
    const attribute = backFace.attributes.properties.find((entry) =>
      ts.isJsxAttribute(entry) && entry.name.getText(file) === name
    )
    assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer))
    const executable = ts.transpileModule(`(${attribute.initializer.expression.getText(file)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
    return runInNewContext(executable, bindings)
  }
  const bindings = {
    showEmbeddedDemoRoom: false,
    authorizedShowcase: undefined,
    profile: {
      roomSnapshot: { uri: "/stale-image" },
      roomSnapshotUrl: "/stale-image",
      roomHeadline: "Stale headline"
    }
  }
  assert.equal(attributeValue("roomSnapshot", bindings), undefined)
  assert.equal(attributeValue("roomHeadline", bindings), undefined)
  // Losing the request prop while this card remains mounted cannot reveal
  // profile fields saved before authorization was removed.
  const removedRequest = expression("showEmbeddedDemoRoom", {
    showcaseRequest: undefined,
    showcaseAuthorization: { id: 3 },
    profile: { ...bindings.profile, userId: "candidate-1" },
    bundledDemoRoomSnapshot: 11
  })
  assert.equal(removedRequest, false)
  assert.equal(attributeValue("roomSnapshot", { ...bindings, showEmbeddedDemoRoom: removedRequest }), undefined)
  assert.equal(attributeValue("roomHeadline", { ...bindings, showEmbeddedDemoRoom: removedRequest }), undefined)
  bindings.authorizedShowcase = { roomSnapshotUrl: "/current-image", roomHeadline: "Current headline" }
  assert.equal(attributeValue("roomSnapshot", bindings).uri, "/current-image")
  assert.equal(attributeValue("roomHeadline", bindings), "Current headline")
  assert.equal(attributeValue("roomSnapshot", {
    ...bindings,
    authorizedShowcase: undefined,
    showEmbeddedDemoRoom: true,
    profile: { roomSnapshot: 11, roomHeadline: "Demo room" }
  }), 11)
  assert.equal(attributeValue("roomHeadline", {
    ...bindings,
    authorizedShowcase: undefined,
    showEmbeddedDemoRoom: true,
    profile: { roomSnapshot: 11, roomHeadline: "Demo room" }
  }), "Demo room")
})

test("only the bundled demo fixture keeps its showcase without an authorization request", () => {
  const demoProfile = {
    userId: "demo-user-001",
    roomSnapshot: 11,
    roomSnapshotUrl: undefined,
    roomHeadline: "Demo room"
  }
  const allow = (profile, showcaseAuthorization = null) => expression("showEmbeddedDemoRoom", {
    showcaseRequest: undefined,
    showcaseAuthorization,
    profile,
    bundledDemoRoomSnapshot: 11
  })
  assert.equal(allow(demoProfile), true)
  assert.equal(allow({ ...demoProfile, roomSnapshot: 12 }), false)
  assert.equal(allow({ ...demoProfile, roomSnapshotUrl: "/untrusted-image" }), false)
  assert.equal(allow({ ...demoProfile, userId: "production-user" }), false)
  assert.equal(allow(demoProfile, { id: 4 }), false)
})

test("flipping back to the front cancels an unfinished showcase request", () => {
  let canceled = 0
  const setValues = []
  const toggleFlip = callback("toggleFlip", {
    disabled: false,
    isBackVisible: true,
    queryClient: { cancelQueries: () => { canceled += 1 } },
    showcaseQueryKey: ["discovery", "room-showcase", "viewer", "candidate"],
    setIsBackVisible: (value) => setValues.push(value),
    setShowcaseAuthorization: (value) => setValues.push(value),
    onFlipChange: undefined,
    reduceMotion: true,
    flipProgress: { setValue: (value) => setValues.push(value) }
  })

  toggleFlip()

  assert.equal(canceled, 1)
  assert.deepEqual(setValues, [null, false, 0])
})
