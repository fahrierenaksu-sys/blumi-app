import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { getProfileSetupCopy } from "./profileSetupCopy"

const profileSetupSource = readFileSync(
  resolve(process.cwd(), "src/screens/ProfileSetupScreen.tsx"),
  "utf8"
)

test("profile setup copy keeps Turkish identity choices clear and respectful", () => {
  const copy = getProfileSetupCopy("tr")

  assert.equal(copy.title, "Seni nasıl tanıyalım?")
  assert.equal(copy.displayName, "Görünen ad")
  assert.equal(copy.displayNamePlaceholder, "Ad veya takma ad")
  assert.equal(copy.woman, "Kadın")
  assert.equal(copy.genderChangeHint, "Sonraki adımda değiştirebilirsin.")
  assert.equal(copy.continueToCharacter, "Karakterimi hazırlayalım")
})

test("profile setup copy retains the English profile completion journey", () => {
  const copy = getProfileSetupCopy("en")

  assert.equal(copy.title, "How should we know you?")
  assert.equal(copy.displayName, "Display name")
  assert.equal(copy.woman, "Woman")
  assert.equal(copy.genderChangeHint, "You can change this in the next step.")
  assert.equal(copy.saveChanges, "Save changes")
})

test("profile setup passes localized heading copy into the shared setup shell", () => {
  assert.match(profileSetupSource, /title=\{copy\.title\}/)
  assert.match(profileSetupSource, /description=\{copy\.subtitle\}/)
})
