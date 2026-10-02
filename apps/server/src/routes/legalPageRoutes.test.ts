import assert from "node:assert/strict"
import test from "node:test"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { createServer } from "../server"

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;")

test("unreviewed public legal pages remain disabled by default", async () => {
  const app = createServer()
  try {
    const response = await app.inject({ method: "GET", url: "/blumi/legal/privacy" })
    assert.equal(response.statusCode, 404)
  } finally {
    await app.close()
  }
})

test("public legal pages render the current app copy with correct content and no login", async () => {
  const appCopy = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    "import copy from './apps/mobile/src/features/legal/legalCopy.ts'; console.log(JSON.stringify(Object.fromEntries(['tr','en'].map(locale => [locale, Object.fromEntries(['privacy','terms','guidelines'].map(type => [type, copy.getLegalContent(locale, type).body]))]))))"
  ], { cwd: resolve(__dirname, "../../../.."), encoding: "utf8" })) as Record<"tr" | "en", Record<"privacy" | "terms" | "guidelines", string>>
  const app = createServer({ legalPagesEnabled: true })
  try {
    const privacy = await app.inject({ method: "GET", url: "/blumi/legal/privacy" })
    assert.equal(privacy.statusCode, 200)
    assert.match(String(privacy.headers["content-type"]), /text\/html/)
    assert.match(privacy.body, /<html lang="tr">/)
    assert.match(privacy.body, /Fahri Eren Aksu/)
    assert.doesNotMatch(privacy.body, /Xavier Ballesteros|Montreal|blumi\.io/)
    assert.match(String(privacy.headers["content-security-policy"]), /default-src 'none'/)

    const english = await app.inject({ method: "GET", url: "/blumi/legal/privacy?lang=en" })
    assert.equal(english.statusCode, 200)
    assert.match(english.body, /<html lang="en">/)
    assert.match(english.body, /Privacy Notice/)

    for (const [path, type] of [
      ["/blumi/legal/privacy", "privacy"],
      ["/blumi/legal/terms", "terms"],
      ["/blumi/legal/child-safety", "guidelines"]
    ] as const) {
      for (const locale of ["tr", "en"] as const) {
        const response = await app.inject({ method: "GET", url: `${path}?lang=${locale}` })
        assert.equal(response.statusCode, 200, `${path} ${locale}`)
        assert.ok(response.body.includes(escapeHtml(appCopy[locale][type])), `${path} ${locale} matches app copy`)
      }
    }
    for (const path of ["/blumi/support", "/blumi/legal/delete-account"]) {
      for (const locale of ["tr", "en"] as const) {
        const response = await app.inject({ method: "GET", url: `${path}?lang=${locale}` })
        assert.equal(response.statusCode, 200, `${path} ${locale}`)
        assert.match(response.body, /cesikeynn19077@hotmail\.com/, path)
        assert.match(response.body, new RegExp(`<html lang="${locale}">`), path)
      }
    }
  } finally {
    await app.close()
  }
})
