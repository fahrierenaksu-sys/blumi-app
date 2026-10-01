import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { getYouScreenCopy } from "./youScreenCopy"

test("profile copy keeps every visible label in the selected language", () => {
  const english = getYouScreenCopy("en")
  const turkish = getYouScreenCopy("tr")

  assert.equal(english.title, "My profile")
  assert.equal(turkish.title, "Profilim")
  assert.equal(english.age(24), "24 years old")
  assert.equal(turkish.age(24), "24 yaşında")
  assert.equal(english.vibe("Rose"), "Rose vibe")
  assert.equal(turkish.vibe("Rose"), "Rose havası")
  assert.equal(english.editProfile, "Edit profile")
  assert.equal(turkish.editProfile, "Profili düzenle")
  assert.equal(english.settings, "Settings")
  assert.equal(turkish.settings, "Ayarlar")
})

test("profile screen renders the centralized copy contract", () => {
  const source = readFileSync(join(process.cwd(), "src/screens/YouScreen.tsx"), "utf8")

  assert.match(source, /getYouScreenCopy\(getAppLocale\(\)\)/)
  assert.doesNotMatch(source, />Edit Profile</)
  assert.doesNotMatch(source, />Sign out</)
  // Sign-out lives only in Settings (DSC-16).
  assert.doesNotMatch(source, /signOut|session-sign-out/)
  assert.match(source, /<BackButton /)
  assert.doesNotMatch(source, /years old/)
})
