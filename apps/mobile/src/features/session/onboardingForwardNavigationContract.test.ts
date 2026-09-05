import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const navigatorSource = readFileSync(
  resolve(import.meta.dirname, "../../navigation/RootNavigator.tsx"),
  "utf8"
)

test("profile completion starts persistence before replacing the visible step", () => {
  assert.match(
    navigatorSource,
    /const profileSave = completeProfileSetup\(input\)[\s\S]{0,620}screenProps\.navigation\.replace\(/
  )
  assert.match(
    navigatorSource,
    /screenProps\.navigation\.replace\([\s\S]{0,240}await profileSave/
  )
  assert.match(
    navigatorSource,
    /await completeAvatarSetup\(avatar\)[\s\S]{0,120}screenProps\.navigation\.replace\("RoomSetup"\)/
  )
})

test("profile completion carries the selected gender into the avatar first frame", () => {
  assert.match(
    navigatorSource,
    /AvatarSetup:\s*\{[\s\S]*?initialGender\?: string[\s\S]*?\}\s*\|\s*undefined/
  )
  assert.match(
    navigatorSource,
    /navigation\.replace\("AvatarSetup",\s*\{\s*initialGender:\s*input\.gender\s*\}\)/
  )
  assert.match(
    navigatorSource,
    /initialGender=\{\s*screenProps\.route\.params\?\.initialGender\s*\?\?\s*sessionActor\.profile\.gender\s*\}/
  )
})
