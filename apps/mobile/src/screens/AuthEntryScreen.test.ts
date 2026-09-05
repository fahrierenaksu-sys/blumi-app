import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

test("the greeting CTA reacts, clears, and only then starts the world motion", () => {
  const file = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "AuthEntryScreen.tsx"),
    "utf8"
  )

  assert.match(
    file,
    /const shouldRenderPreludeActions =\s*\n\s*\(arePreludeActionsVisible \|\| isPreludeSecondaryVisible\) &&\s*\n\s*isPrelude/
  )
  assert.match(file, /isPreludeSecondaryVisible && !isPreludeActionsExiting/)
  assert.match(file, /styles\.cinematicPrimaryPlaceholder/)
  assert.match(file, /hapticLight\(\)/)
  assert.match(file, /duration: ONBOARDING_SCENE_HANDOFF_MS\.actionResponse/)
  assert.match(
    file,
    /\.start\(\(\{ finished \}\) => \{[\s\S]*if \(!finished\) return[\s\S]*dispatchIntro\(\{ type: "reveal-world", reduceMotion \}\)/
  )
})

test("the world CTA can reveal on the final chase beat and uses a stable scene callback", () => {
  const file = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "AuthEntryScreen.tsx"),
    "utf8"
  )

  assert.match(file, /const \[isWhoaVisible, setIsWhoaVisible\] = useState\(false\)/)
  assert.match(file, /const handleWhoaVisible = useCallback\(\(\) => setIsWhoaVisible\(true\), \[\]\)/)
  assert.match(file, /onWhoaVisible=\{handleWhoaVisible\}/)
  assert.match(file, /const shouldRenderWhoaAction = isWorldReady \|\| isWhoaVisible/)
})

test("Whoa taps during the authored world beat still use the handoff entrance", () => {
  const file = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "AuthEntryScreen.tsx"),
    "utf8"
  )

  assert.match(
    file,
    /const startsWorldHandoff =\s*[\s\S]*intent === "create" &&\s*\(isWhoaVisible \|\| introState\.phase === "world-ready"\)/
  )
  assert.match(file, /const canFadeOutgoingWorld = introState\.phase === "world-ready"/)
  assert.match(file, /if \(!canFadeOutgoingWorld\) return/)
})

test("Whoa stays on the same bottom action rail as the setup primary actions", () => {
  const file = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "AuthEntryScreen.tsx"),
    "utf8"
  )

  assert.match(
    file,
    /shouldRenderWhoaAction \? \(\s*<CinematicActionButton[\s\S]*testID="onboarding-whoa"/
  )
  assert.doesNotMatch(file, /styles\.worldReadyActionLift/)
  assert.doesNotMatch(file, /worldReadyActionLift:\s*\{/)
  assert.match(
    file,
    /safe:\s*\{[\s\S]*paddingBottom: ONBOARDING_PRIMARY_ACTION_LAYOUT\.bottomInset/
  )
  assert.doesNotMatch(
    file,
    /safeCompact:\s*\{[^}]*padding(?:Vertical|Bottom)/
  )
  assert.match(file, /getOnboardingPrimaryActionMetrics\(viewportWidth\)/)
  assert.match(file, /paddingHorizontal: primaryActionMetrics\.horizontalInset/)
  assert.match(
    file,
    /cinematicAction:\s*\{[^}]*minHeight:\s*ONBOARDING_PRIMARY_ACTION_LAYOUT\.height/
  )
  assert.match(
    file,
    /controlCompact:\s*\{[^}]*minHeight:\s*ONBOARDING_PRIMARY_ACTION_LAYOUT\.height/
  )
})

test("every cinematic primary CTA uses the Whoa bottom rail", () => {
  const file = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "AuthEntryScreen.tsx"),
    "utf8"
  )

  assert.match(file, /preludeActions:\s*\{[^}]*justifyContent:\s*"flex-end"/)
  assert.match(
    file,
    /isPreludeSecondaryVisible[\s\S]*<CinematicActionButton[\s\S]*testID=\{isCharacterGreeting/
  )
})
