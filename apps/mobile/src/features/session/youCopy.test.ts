import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import { getOwnProfileCopy } from "../profile/profileCopy"

const srcRoot = join(process.cwd(), "src")
const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8")

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function profileSurfaceSources(): string {
  const featureFiles = readdirSync(join(srcRoot, "features/profile"))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => `src/features/profile/${name}`)
  return ["src/screens/YouScreen.tsx", ...featureFiles].map(read).join("\n")
}

test("profile copy keeps every visible label in the selected language", () => {
  const english = getOwnProfileCopy("en")
  const turkish = getOwnProfileCopy("tr")

  assert.equal(english.title, "My profile")
  assert.equal(turkish.title, "Profilim")
  assert.equal(english.vibe("Rose"), "Rose vibe")
  assert.equal(turkish.vibe("Rose"), "Rose havası")
  assert.equal(english.editProfile, "Edit profile")
  assert.equal(turkish.editProfile, "Profili düzenle")
  assert.equal(english.settings, "Settings")
  assert.equal(turkish.settings, "Ayarlar")
  assert.equal(turkish.completenessTitle(60), "Profilin %60 hazır")
  assert.equal(english.completenessTitle(60), "Your profile is 60% ready")
  assert.equal(turkish.previewTitle, "Başkaları seni nasıl görüyor")
  assert.equal(turkish.myRoomEntryLabel, "Profilim")
  assert.deepEqual(Object.keys(turkish).sort(), Object.keys(english).sort())
  for (const [key, value] of Object.entries(turkish)) {
    if (typeof value === "string") assert.notEqual(value.trim(), "", `tr.${key}`)
  }
})

test("DSC-9: profile edit guards unsaved edits, saves from the top bar and edits interests as chips", () => {
  const source = read("src/screens/ProfileEditScreen.tsx")
  assert.match(source, /useProfileEditExitGuard\(\{ enabled: shouldConfirmProfileEditExit\(\{ hasChanges, isSaving, saved \}\)/)
  assert.match(source, /rightSlot=\{\s*<ProfileEditSaveButton enabled=\{canSave && hasChanges\}/)
  assert.match(source, /<ProfileInterestsField /)
  assert.match(source, /hapticSuccess\(\)/)
  assert.doesNotMatch(source, /coffee\\nfilms/)
  const guard = read("src/features/session/useProfileEditExitGuard.ts")
  assert.match(guard, /usePreventRemove\(enabled,/)
  assert.match(guard, /navigation\.dispatch\(data\.action\)/)
})

test("the own profile opens from one place: My Room's profile button", () => {
  const openers = listSourceFiles(srcRoot)
    .filter((path) => /navigate\("You"\)/.test(readFileSync(path, "utf8")))
    .map((path) => relative(srcRoot, path))
  assert.deepEqual(openers, ["screens/MyRoomScreen.tsx"])
  const myRoom = read("src/screens/MyRoomScreen.tsx")
  assert.match(myRoom, /<MyRoomProfileButton[\s\S]*?onPress=\{\(\) => navigation\.navigate\("You"\)\}/)
  assert.doesNotMatch(myRoom, /ellipsis-horizontal/)
  // Discover keeps its header but no longer carries a profile chip.
  const discoverHeader = read("src/features/discovery/screen/DiscoverHomeHeader.tsx")
  assert.doesNotMatch(discoverHeader, /CandidateAvatarPreview|homeProfileChip|"You"/)
  assert.doesNotMatch(read("src/screens/LobbyScreen.tsx"), /"You"/)
})

test("Settings stays reachable from the profile, and sign-out lives only in Settings (DSC-16)", () => {
  const you = read("src/screens/YouScreen.tsx")
  assert.match(you, /getOwnProfileCopy\(locale\)/)
  assert.match(you, /navigation\.navigate\("Settings"\)/)
  assert.match(read("src/features/profile/OwnProfileHero.tsx"), /accessibilityLabel=\{copy\.settings\}[\s\S]*?name="settings-outline"/)
  const profileSurface = profileSurfaceSources()
  assert.doesNotMatch(profileSurface, /signOut|session-sign-out|onResetSession\(/)
  assert.doesNotMatch(profileSurface, />Edit Profile<|>Sign out</)
  assert.match(read("src/features/settings/SettingsAccountSection.tsx"), /label=\{copy\.signOut\}/)
})
