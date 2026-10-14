import assert from "node:assert/strict"
import test from "node:test"
import { createContext, Script } from "node:vm"
import Fastify from "fastify"
import { registerAdminConsoleRoutes } from "./adminConsole"

// The console must act only on the account it shows. Fast A→B selection with
// responses arriving in reverse order, a click while the next account loads,
// or a sign-out and new sign-in must never send an action for another account.

class FakeElement {
  tagName: string
  className = ""
  id = ""
  hidden = false
  disabled = false
  value = ""
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  listeners = new Map<string, Array<(event: unknown) => unknown>>()
  private text = "";
  [key: string]: unknown

  constructor(tagName: string) { this.tagName = tagName.toUpperCase() }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join("") }
  set textContent(value: string) { this.text = String(value); this.children = [] }
  append(...nodes: FakeElement[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: FakeElement[]) { this.text = ""; this.children = [...nodes] }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)) }
  addEventListener(type: string, listener: (event: unknown) => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  focus() {}
  descendants(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.descendants()]) }
  querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] ?? null }
  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((node) => matches(node, selector))
  }
}

function matches(node: FakeElement, selector: string): boolean {
  return selector.split(",").map((part) => part.trim()).some((part) => {
    if (part.startsWith("#")) return node.id === part.slice(1)
    if (part.startsWith(".")) return node.className.split(" ").includes(part.slice(1))
    return node.tagName === part.toUpperCase()
  })
}

interface RecordedRequest {
  path: string
  method: string
  auth: string | null
  body: unknown
  settled: boolean
  resolve(body: unknown): void
}

function userRecord(userId: string) {
  return {
    userId,
    displayName: userId === "user_alpha" ? "Alpha" : "Beta",
    maskedPhone: "masked",
    createdAt: "2026-10-01T10:00:00.000Z",
    discoveryQuota: { remaining: 3, limit: 10, used: 7, extensionDecisions: 0, resetsAt: "2026-10-15T00:00:00.000Z" }
  }
}

async function loadConsoleScript(): Promise<string> {
  const app = Fastify()
  await registerAdminConsoleRoutes(app)
  try {
    return (await app.inject({ method: "GET", url: "/admin/console.js" })).body
  } finally {
    await app.close()
  }
}

async function startConsole() {
  const byId = new Map<string, FakeElement>()
  const document = {
    hidden: false,
    querySelector(selector: string) {
      if (!byId.has(selector)) {
        const node = new FakeElement("div")
        node.id = selector.replace(/^#/, "")
        byId.set(selector, node)
      }
      return byId.get(selector)
    },
    createElement: (tag: string) => new FakeElement(tag)
  }
  const requests: RecordedRequest[] = []
  const fetch = (path: string, options: { method?: string, headers: Headers, body?: string }) => {
    const method = options.method ?? "GET"
    const auth = options.headers.get("Authorization")
    if (path === "/v1/admin/session") {
      return Promise.resolve(reply({ scopes: ["users:read", "users:manage"], operatorId: "operator", expiresAt: "2026-10-14T23:00:00.000Z" }))
    }
    if (path.startsWith("/v1/admin/users?query=")) {
      return Promise.resolve(reply({ users: [userRecord("user_alpha"), userRecord("user_beta")] }))
    }
    return new Promise((resolve) => {
      requests.push({
        path, method, auth, body: options.body ? JSON.parse(options.body) : undefined, settled: false,
        resolve(body) { this.settled = true; resolve(reply(body)) }
      })
    })
  }
  const context = createContext({
    document, fetch, Headers,
    window: { confirm: () => true },
    navigator: {},
    setInterval: () => 0
  })
  new Script(await loadConsoleScript(), { filename: "admin-console.js" }).runInContext(context)

  const $ = (selector: string) => document.querySelector(selector)!
  const fire = async (node: FakeElement, type: string) => {
    // Handlers may wait on a response the test releases later, so they are not awaited.
    for (const listener of node.listeners.get(type) ?? []) void listener({ preventDefault() {} })
    await settle()
  }
  const signIn = async (sessionToken: string) => {
    $("#token").value = sessionToken
    await fire($("#login-form"), "submit")
  }
  const search = async () => {
    $("#query").value = "test"
    await fire($("#search-form"), "submit")
  }
  const resultButton = (userId: string) => $("#results").descendants()
    .find((node) => node.tagName === "BUTTON" && node.textContent.includes(userId))!
  const respondToUser = async (userId: string) => {
    for (const pending of requests.filter((entry) => !entry.settled && entry.path.includes("/" + userId))) {
      pending.resolve(pending.path.endsWith("/quota-audit") ? { events: [] } : { user: userRecord(userId) })
    }
    await settle()
  }
  const grantButton = () => $("#detail").descendants()
    .find((node) => node.tagName === "BUTTON" && node.textContent === "Ek hak tanımla")
  const grant = async (button = grantButton()) => {
    assert.ok(button, "a grant button is drawn")
    $("#detail").querySelector("#action-reason")!.value = "support request for testing"
    await fire(button, "click")
  }
  const actions = () => requests.filter((entry) => entry.method === "POST")
  const shownUser = () => {
    const text = $("#detail").textContent
    return ["user_alpha", "user_beta"].filter((userId) => text.includes(userId))
  }
  return { $, fire, signIn, search, resultButton, respondToUser, grant, grantButton, actions, shownUser }
}

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

const settle = async () => {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

test("with reversed responses the console shows and acts on the last selected account", async () => {
  const console = await startConsole()
  await console.signIn("session-one")
  await console.search()
  await console.fire(console.resultButton("user_alpha"), "click")
  await console.fire(console.resultButton("user_beta"), "click")
  await console.respondToUser("user_beta")
  await console.respondToUser("user_alpha")

  assert.deepEqual(console.shownUser(), ["user_beta"], "the late answer for the earlier selection is dropped")
  await console.grant()
  assert.equal(console.actions().length, 1)
  assert.match(console.actions()[0]!.path, /\/users\/user_beta\/discovery-quota\/grant$/)
})

test("an action drawn for one account never fires while the next account loads", async () => {
  const console = await startConsole()
  await console.signIn("session-one")
  await console.search()
  await console.fire(console.resultButton("user_alpha"), "click")
  await console.respondToUser("user_alpha")
  const alphaGrant = console.grantButton()!
  assert.deepEqual(console.shownUser(), ["user_alpha"])

  await console.fire(console.resultButton("user_beta"), "click")
  assert.equal(alphaGrant.disabled, true, "actions are disabled while another account loads")
  await console.grant(alphaGrant)
  assert.equal(console.actions().length, 0, "no action is sent for a record that is being replaced")

  await console.respondToUser("user_beta")
  await console.grant()
  assert.equal(console.actions().length, 1)
  assert.match(console.actions()[0]!.path, /\/users\/user_beta\//)
})

test("an account loaded under an earlier operator session is never drawn or acted on", async () => {
  const console = await startConsole()
  await console.signIn("session-one")
  await console.search()
  await console.fire(console.resultButton("user_alpha"), "click")
  await console.fire(console.$("#logout"), "click")
  await console.signIn("session-two")
  await console.respondToUser("user_alpha")

  assert.deepEqual(console.shownUser(), [], "the old session's answer is not drawn")
  assert.equal(console.grantButton(), undefined)
  assert.equal(console.actions().length, 0)
})
