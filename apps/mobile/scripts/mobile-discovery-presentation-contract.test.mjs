import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("production Discover reuses the approved demo deck presentation", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const deckSource = read("src/screens/DemoLobbyView.tsx")
  const sharedDeckSource = read("src/features/discovery/DiscoveryDeckView.tsx")
  const viewportLayoutSource = read("src/features/discovery/discoveryLayoutMetrics.ts")

  assert.match(lobbySource, /<DiscoveryDeckView[\s\S]*?profiles=\{visibleDiscoverDeck\}/)
  assert.match(lobbySource, /const visibleDiscoverDeck = discoveryQuotaExhausted \? \[\] : discoverDeck/)
  assert.doesNotMatch(lobbySource, /<DiscoverCard\b/)
  assert.doesNotMatch(lobbySource, /DUMMY_PROFILES|useDemoStore/)

  assert.match(deckSource, /<DiscoveryDeckView[\s\S]*?profiles=\{demo\.deck(?:\.map\([\s\S]*?\))?\}/)
  assert.match(sharedDeckSource, /container:\s*\{[\s\S]*?gap:\s*uiTheme\.spacing\.md[\s\S]*?paddingHorizontal:\s*20[\s\S]*?paddingTop:\s*10/)
  assert.match(sharedDeckSource, /useAppViewportMetrics\(\{[\s\S]*?bottomNavVisible:\s*true[\s\S]*?\}\)/)
  assert.match(sharedDeckSource, /resolveDiscoveryLayoutMetrics\(screenWidth, screenHeight\)/)
  assert.match(sharedDeckSource, /height:\s*viewportLayout\.deckHeight/)
  assert.match(viewportLayoutSource, /REFERENCE_VIEWPORT_WIDTH\s*=\s*402/)
  assert.match(viewportLayoutSource, /REFERENCE_DECK_HEIGHT\s*=\s*548/)
  assert.match(viewportLayoutSource, /COMPACT_VIEWPORT_MAX_HEIGHT\s*=\s*720/)
  assert.match(sharedDeckSource, /layoutMetrics=\{viewportLayout\.card\}/)
  assert.doesNotMatch(sharedDeckSource, /resolveCompactViewportLayout/)
  assert.doesNotMatch(sharedDeckSource, /compact=\{viewportLayout/)
  assert.match(sharedDeckSource, /actionRow:\s*\{[\s\S]*?position:\s*"absolute"[\s\S]*?bottom:\s*30/)
  assert.match(sharedDeckSource, /progressRow:\s*\{[\s\S]*?marginTop:\s*-uiTheme\.spacing\.xs/)
  assert.doesNotMatch(deckSource, /demoContainer:\s*\{[\s\S]*?paddingHorizontal:\s*20/)
  assert.match(lobbySource, /<View style=\{styles\.homeProfileSheen\}/)
  assert.match(lobbySource, /homeProfileChip:\s*\{[\s\S]*?paddingHorizontal:\s*8[\s\S]*?paddingVertical:\s*7[\s\S]*?backgroundColor:\s*uiTheme\.ambientGlass\.surface/)
})

test("production Discover reserves the shared responsive bottom navigation inset", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")

  assert.match(lobbySource, /useAppViewportMetrics\(\{[\s\S]*?bottomNavVisible:\s*true[\s\S]*?\}\)/)
  assert.match(lobbySource, /paddingBottom:\s*viewportMetrics\.bottomContentInset\s*\+\s*uiTheme\.spacing\.lg/)
  assert.doesNotMatch(lobbySource, /const\s+BOTTOM_NAV_HEIGHT\s*=/)
  assert.doesNotMatch(lobbySource, /useSafeAreaInsets/)
})

test("approved swipe card accepts real candidate avatar and private distance data", () => {
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")

  assert.match(cardSource, /export interface SwipeableDiscoverProfile/)
  assert.match(cardSource, /avatarPresetId\?:\s*string/)
  assert.match(cardSource, /avatar\?:\s*AvatarSelection/)
  assert.match(cardSource, /avatarPresetId:\s*profile\.avatarPresetId/)
  assert.match(cardSource, /avatarSelection:\s*profile\.avatar/)
  assert.match(cardSource, /profile\.distanceLabel/)
  assert.match(cardSource, /bio\?:\s*string/)
  assert.match(cardSource, /formatDiscoveryCardBio\(profile\.bio\)/)
  assert.match(cardSource, /numberOfLines=\{2\}/)
})

test("discover bio is concise and stays inside the existing profile summary", () => {
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")

  assert.match(cardSource, /styles\.nameRow[\s\S]*?styles\.bioText[\s\S]*?styles\.tagsRow/)
  assert.doesNotMatch(cardSource, /About me|Your perfect match|Made for you/i)
})

test("card back is a bounded, accessible 3D face with a calm fallback", () => {
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")
  const flipModelSource = read("src/features/discovery/discoveryCardFlipModel.ts")

  assert.match(cardSource, /accessibilityLabel=\{isBackVisible \? copy\.card\.showProfile : copy\.card\.flipProfile\}/)
  assert.match(cardSource, /DISCOVERY_CARD_FLIP_DURATION/)
  assert.match(cardSource, /const frontRotation = flipProgress\.interpolate/)
  assert.match(cardSource, /const backRotation = flipProgress\.interpolate/)
  assert.match(cardSource, /backfaceVisibility:\s*["']hidden["']/)
  assert.match(cardSource, /perspective:\s*1000/)
  assert.match(cardSource, /styles\.backFace/)
  assert.match(cardSource, /styles\.flipSheen/)
  assert.match(cardSource, /reduceMotion \? 0 : sheenOpacity/)
  assert.match(cardSource, /numberOfLines=\{3\}/)
  assert.match(flipModelSource, /DISCOVERY_CARD_FLIP_DURATION = 360/)
  assert.match(flipModelSource, /if \(reduceMotion\)/)
  assert.doesNotMatch(cardSource, /relationshipIntent|showRelationshipIntent/i)
})

test("discovery actions stay on the front face while the card back is open", () => {
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")
  const deckSource = read("src/features/discovery/DiscoveryDeckView.tsx")

  assert.match(cardSource, /onFlipChange\?:\s*\(flipped:\s*boolean\) => void/)
  assert.match(cardSource, /onFlipChange\?\.\(nextVisible\)/)
  assert.match(deckSource, /const \[isFeaturedFlipped, setIsFeaturedFlipped\] = useState\(false\)/)
  assert.match(deckSource, /onFlipChange=\{isTop \? setIsFeaturedFlipped : undefined\}/)
  assert.match(deckSource, /pointerEvents=\{isFeaturedFlipped \? "none" : "box-none"\}/)
  assert.match(deckSource, /opacity:\s*isFeaturedFlipped \? 0 : 1/)
})

test("deck transition resets the outgoing swipe before the next card paints", () => {
  const sharedDeckSource = read("src/features/discovery/DiscoveryDeckView.tsx")
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const demoSource = read("src/screens/DemoLobbyView.tsx")

  assert.match(sharedDeckSource, /useLayoutEffect\(\(\) => \{/)
  assert.match(sharedDeckSource, /swipeAnim\.setValue\(\{ x: 0, y: 0 \}\)/)
  assert.match(sharedDeckSource, /\[featured\?\.userId, swipeAnim\]/)
  assert.doesNotMatch(lobbySource, /cardEntryAnim/)
  assert.doesNotMatch(lobbySource, /cardAnimationKey/)
  assert.match(demoSource, /useRef\(new Animated\.ValueXY\(\)\)\.current/)
  assert.doesNotMatch(demoSource, /setSwipeAnim|setFeaturedId/)
  assert.match(sharedDeckSource, /key=\{profile\.userId\}/)
})

test("production decisions advance optimistically without locking the next profile", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")

  assert.match(lobbySource, /inFlightDecisionUserIdsRef/)
  assert.match(lobbySource, /markCandidateSeen\(candidate\.userId\)[\s\S]*?await decideDiscoverProfile/)
  assert.match(lobbySource, /actionsDisabled=\{discoveryQuotaExhausted \|\| \(featuredCandidate \? inFlightDecisionUserIds\.has\(featuredCandidate\.userId\) : false\)\}/)
  assert.doesNotMatch(lobbySource, /actionsDisabled=\{decidingUserId !== null\}/)
  assert.match(
    lobbySource,
    /restoreCandidateAfterDecisionFailure[\s\S]{0,220}cardDragX\.setValue\(\{ x: 0, y: 0 \}\)/
  )
})

test("quota exhaustion is separate from candidate supply and never promises an unconfigured reward", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const copySource = read("src/features/discovery/discoverySurfaceCopy.ts")

  assert.match(lobbySource, /state=\{discoveryQuotaExhausted[\s\S]*?"quota-exhausted"/)
  assert.match(emptySource, /state\?: "exhausted" \| "low-supply" \| "quota-exhausted"/)
  assert.match(copySource, /rewardTitle: "Rewarded ads unavailable"/)
  assert.match(emptySource, /accessibilityRole="text"/)
  assert.doesNotMatch(emptySource, /Watch an ad to unlock/)
})

test("discovery action buttons use the same animated swipe path as gestures", () => {
  const sharedDeckSource = read("src/features/discovery/DiscoveryDeckView.tsx")

  assert.match(sharedDeckSource, /actionSwipeInFlightRef = useRef\(false\)/)
  assert.match(sharedDeckSource, /Animated\.timing\(swipeAnim,/)
  assert.match(sharedDeckSource, /runActionSwipe\("left"\)/)
  assert.match(sharedDeckSource, /runActionSwipe\("right"\)/)
  assert.doesNotMatch(sharedDeckSource, /zIndex:\s*-/)
  assert.match(sharedDeckSource, /copy\.actions\.pass/)
  assert.match(sharedDeckSource, /copy\.actions\.like/)
  assert.doesNotMatch(sharedDeckSource, />Details</)
  assert.doesNotMatch(sharedDeckSource, /Open profile details/)
})

test("Discover ambient glass shares one shadowless light system", () => {
  const themeSource = read("src/ui/theme.ts")
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")
  const deckSource = read("src/features/discovery/DiscoveryDeckView.tsx")
  const bottomNavSource = read("src/ui/bottomNav.tsx")
  const rootSource = read("src/navigation/RootNavigator.tsx")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")

  assert.match(
    themeSource,
    /ambientGlass:\s*\{[\s\S]*?surface:\s*"rgba\(255, 255, 255, 0\.34\)"[\s\S]*?surfaceStrong:\s*"rgba\(255, 255, 255, 0\.52\)"[\s\S]*?edgeLight:\s*"rgba\(255, 255, 255, 0\.88\)"[\s\S]*?edgeShade:\s*"rgba\(104, 82, 126, 0\.10\)"/
  )
  assert.match(lobbySource, /backgroundColor:\s*uiTheme\.ambientGlass\.surface/)
  assert.match(lobbySource, /borderColor:\s*uiTheme\.ambientGlass\.edgeLight/)
  assert.doesNotMatch(
    lobbySource,
    /homeProfileChip:\s*\{(?:(?!homeProfileChipPressed:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.doesNotMatch(
    lobbySource,
    /filterButton:\s*\{(?:(?!filterButtonGlow:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )

  assert.match(cardSource, /backgroundColor:\s*uiTheme\.ambientGlass\.surface/)
  assert.match(cardSource, /borderColor:\s*uiTheme\.ambientGlass\.edgeLight/)
  assert.doesNotMatch(
    cardSource,
    /card:\s*\{(?:(?!heroGlow:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.doesNotMatch(
    cardSource,
    /infoOverlay:\s*\{(?:(?!infoOverlayCompact:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.doesNotMatch(
    cardSource,
    /onlineDot:\s*\{(?:(?!tagsRow:)[\s\S])*?(?:shadowColor|elevation:)/
  )
  assert.doesNotMatch(
    cardSource,
    /distancePill:\s*\{(?:(?!signalPill:)[\s\S])*?(?:shadowColor|elevation:)/
  )

  assert.match(deckSource, /backgroundColor:\s*uiTheme\.ambientGlass\.surface/)
  assert.doesNotMatch(
    deckSource,
    /actionRow:\s*\{(?:(?!actionRowCompact:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.match(
    deckSource,
    /accessibilityLabel=\{copy\.actions\.likeAccessibilityLabel\}[\s\S]*?variant="primary"/
  )

  assert.match(bottomNavSource, /bottomNavAmbient:\s*\{[\s\S]*?backgroundColor:\s*uiTheme\.ambientGlass\.surfaceStrong/)
  assert.match(bottomNavSource, /bottomNavAmbient:\s*\{[\s\S]*?borderColor:\s*uiTheme\.ambientGlass\.edgeLight/)
  assert.match(
    bottomNavSource,
    /bottomNavBadgeAmbient:\s*\{[\s\S]*?shadowOpacity:\s*0[\s\S]*?elevation:\s*0/
  )
  assert.match(rootSource, /appearance=\{currentBottomNavKey === "discover" \? "ambient" : "default"\}/)
  assert.doesNotMatch(
    bottomNavSource,
    /bottomNav:\s*\{(?:(?!navTint:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.doesNotMatch(
    emptySource,
    /emptyCard:\s*\{(?:(?!lowSupplyCard:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
  assert.doesNotMatch(
    emptySource,
    /refreshButtonWrap:\s*\{(?:(?!refreshButtonPressed:)[\s\S])*?\.\.\.uiTheme\.shadow\.(?:soft|float|card|deep|glow)/
  )
})

test("the active discovery card rests straight and only back cards form the stack", () => {
  const sharedDeckSource = read("src/features/discovery/DiscoveryDeckView.tsx")

  assert.match(
    sharedDeckSource,
    /visibleProfiles = useMemo\([\s\S]*?\[profiles\[2\], profiles\[1\], featured\]/
  )
  assert.match(
    sharedDeckSource,
    /topCardContainer:\s*\{[\s\S]*?transform:\s*\[[\s\S]*?translateX:\s*0[\s\S]*?translateY:\s*0[\s\S]*?rotate:\s*"0deg"[\s\S]*?scale:\s*1[\s\S]*?\][\s\S]*?opacity:\s*1[\s\S]*?zIndex:\s*3/
  )
  assert.match(
    sharedDeckSource,
    /isMiddle[\s\S]*?translateX:\s*middleCardTranslateX[\s\S]*?translateY:\s*middleCardTranslateY[\s\S]*?rotate:\s*"0deg"[\s\S]*?scale:\s*middleCardScale/
  )
  assert.match(
    sharedDeckSource,
    /bottomCardContainer:\s*\{[\s\S]*?translateX:\s*-?\d+[\s\S]*?translateY:\s*-?\d+[\s\S]*?rotate:\s*"-?\d+deg"[\s\S]*?scale:\s*0\.\d+/
  )
  assert.match(sharedDeckSource, /pointerEvents=\{isTop \? "auto" : "none"\}/)
  assert.match(sharedDeckSource, /\{!isTop \? <GlassDeckOverlay \/> : null\}/)
  assert.match(sharedDeckSource, /\{featured \? \(/)
  assert.match(
    sharedDeckSource,
    /\{featured && viewportLayout\.showProgress \? \([\s\S]*?styles\.progressRow/
  )
})

test("Discovery card geometry consumes continuous numeric layout metrics", () => {
  const cardSource = read("src/features/demo/SwipeableDiscoverCard.tsx")

  assert.match(cardSource, /layoutMetrics\?:\s*DiscoveryCardLayoutMetrics/)
  assert.match(cardSource, /size=\{avatarSize\}/)
  assert.match(cardSource, /marginBottom:\s*avatarBottomInset/)
  assert.match(cardSource, /bottom:\s*infoOverlayBottom/)
  assert.match(cardSource, /fontSize:\s*nameFontSize/)
  assert.match(cardSource, /fontSize:\s*ageFontSize/)
})

test("global Discovery pagination prefetches without replacing the deck", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const querySource = read("src/features/discovery/discoveryQueryOptions.ts")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const copySource = read("src/features/discovery/discoverySurfaceCopy.ts")

  assert.match(querySource, /fetchDiscoverPage/)
  assert.match(querySource, /getNextPageParam/)
  assert.match(lobbySource, /useInfiniteQuery/)
  assert.match(lobbySource, /productionDiscoveryQuery\.hasNextPage/)
  assert.match(lobbySource, /productionDiscoveryQuery\.fetchNextPage\(\)/)
  assert.match(lobbySource, /flattenDiscoveryPages/)
  assert.match(lobbySource, /const productionSupplyState = lastProductionPage\?\.supply\.state/)
  assert.match(
    lobbySource,
    /state=\{discoveryQuotaExhausted[\s\S]*?productionSupplyState === "low"[\s\S]*?"low-supply"[\s\S]*?"exhausted"/
  )
  assert.doesNotMatch(emptySource, /onExpandRadius/)
  assert.doesNotMatch(emptySource, /Search a wider area/)
  assert.doesNotMatch(lobbySource, /setRadiusKm/)
})

test("production cards use real discovery signals without synthetic fit metadata", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const candidateSource = read("src/features/discovery/discoveryCandidateModel.ts")
  const previewSource = read("src/screens/ProfilePreviewScreen.tsx")

  assert.match(candidateSource, /signals:\s*\[\.\.\.profile\.signals\]/)
  assert.match(lobbySource, /productionProfiles\.map\(createProductionDiscoveryCandidate\)/)
  assert.doesNotMatch(lobbySource, /featuredCandidate\.signals\?\.slice\(0, 3\)/)
  assert.doesNotMatch(lobbySource, /Discovery fit|In your preferences|Open to connect/)
  assert.doesNotMatch(lobbySource, /Open to a mutual match/)
  assert.match(
    previewSource,
    /\{profile\.bio \?[\s\S]*?\{profile\.tags\.length > 0 \?/
  )
  assert.match(
    previewSource,
    /import \{ getDiscoveryDecisionErrorMessageForDisplay \} from "\.\.\/features\/discovery\/discoveryErrorCopy"/
  )
  assert.match(
    previewSource,
    /setDecisionError\(getDiscoveryDecisionErrorMessageForDisplay\(error\)\)/
  )
  assert.doesNotMatch(previewSource, /error\.message/)
})

test("server discovery delegates stable pagination and rechecks safety exclusions", () => {
  const routeSource = read("../server/src/routes/discoverRoutes.ts")
  const snapshotSource = read("../server/src/matches/discoverySnapshot.ts")

  assert.match(routeSource, /snapshotPage = await discoverySnapshots\.page\(/)
  assert.match(routeSource, /blockedUserIds: \(ids\) => safetyService\.listBlockedUserIdsBetween/)
  assert.match(routeSource, /page: snapshotPage\.page/)
  assert.match(snapshotSource, /const blocked = new Set\(await input\.blockedUserIds/)
  assert.match(snapshotSource, /if \(row\.profile && !blocked\.has\(row\.profile\.userId\)\)/)
  assert.match(
    snapshotSource,
    /position = row\.position \+ 1/
  )
  assert.match(snapshotSource, /nextCursor: hasMore \? encodeCursor\(meta\.snapshotId, position\) : null/)
})

test("profile edit separates identity, discovery preferences, and avatar body routing", () => {
  const profileEditSource = read("src/screens/ProfileEditScreen.tsx")
  const rootSource = read("src/navigation/RootNavigator.tsx")

  assert.match(profileEditSource, /identityGender:\s*currentIdentityGender/)
  assert.match(profileEditSource, /discoveryGenders/)
  assert.match(profileEditSource, /radiusKm/)
  assert.match(profileEditSource, /navigation\.navigate\("WardrobeV2"\)/)
  assert.match(rootSource, /currentAvatarBodyId=/)
  assert.doesNotMatch(profileEditSource, /navigate\("AvatarSetup"\)/)
})

test("low-supply Vibe Card is server-backed, expiring, and cancellable", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const querySource = read("src/features/discovery/discoveryQueryOptions.ts")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const routeSource = read("../server/src/routes/discoverRoutes.ts")
  const copySource = read("src/features/discovery/discoverySurfaceCopy.ts")

  assert.match(querySource, /fetchDiscoveryWatch/)
  assert.match(lobbySource, /useQuery/)
  assert.match(lobbySource, /discoveryWatchQuery/)
  assert.match(lobbySource, /activateDiscoveryWatch/)
  assert.match(lobbySource, /cancelDiscoveryWatch/)
  assert.match(lobbySource, /isDiscoveryWatchActive\(discoveryWatch\)/)
  assert.match(lobbySource, /setTimeout\([\s\S]*?Date\.parse\(discoveryWatch\.expiresAt\) - Date\.now\(\)/)
  assert.match(copySource, /watchActivate: "Keep looking for me"/)
  assert.match(copySource, /saved for 7 days/i)
  assert.match(copySource, /watchCancel: "Cancel Vibe Card"/)
  assert.match(routeSource, /app\.put\("\/v1\/discover\/watch"/)
  assert.match(routeSource, /app\.delete\("\/v1\/discover\/watch"/)
})

test("production and demo share the approved end-of-deck screen", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const demoSource = read("src/screens/DemoLobbyView.tsx")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const sharedDeckSource = read("src/features/discovery/DiscoveryDeckView.tsx")
  const copySource = read("src/features/discovery/discoverySurfaceCopy.ts")

  assert.match(lobbySource, /<EmptyDiscoveryDeck\b/)
  assert.match(demoSource, /<EmptyDiscoveryDeck\b/)
  assert.match(copySource, /exhaustedTitle: "That's everyone for now\."/)
  assert.match(copySource, /refreshAction: "Check again"/)
  assert.match(emptySource, /resolveDiscoveryLayoutMetrics\(viewport\.width, viewport\.height\)\.deckHeight/)
  assert.doesNotMatch(emptySource, /emptyDeck:\s*\{[\s\S]*?height:\s*548/)
  assert.match(emptySource, /emptyMiddleCard/)
  assert.match(emptySource, /emptyBottomCard/)
  assert.match(emptySource, /discover-card-surface\.png/)
  assert.match(emptySource, /avatarSelection:\s*props\.avatarSelection/)
  assert.match(emptySource, /<CandidateAvatarPreview/)
  assert.doesNotMatch(emptySource, /ALL CAUGHT UP|restingBadge/)
  assert.match(emptySource, /backgroundColor:\s*"#FFF7FC"/)
  assert.match(emptySource, /emptyPhotoProgress/)
  assert.doesNotMatch(emptySource, /cardWash|heroGlow/)
  assert.match(lobbySource, /<CandidateAvatarPreview[\s\S]*?snapshot=\{myAvatarSnapshot\}/)
  assert.match(emptySource, /refreshing\?:\s*boolean/)
  assert.match(emptySource, /disabled=\{props\.refreshing\}/)
  assert.match(emptySource, /<ActivityIndicator/)
  assert.match(sharedDeckSource, /\{featured \? \([\s\S]*?styles\.progressRow[\s\S]*?\) : null\}/)
})

test("production discovery keeps loading distinct from a genuinely exhausted deck", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")
  const emptySource = read("src/features/discovery/EmptyDiscoveryDeck.tsx")

  assert.match(lobbySource, /showDiscoveryLoading/)
  assert.match(lobbySource, /<LoadingDiscoveryDeck/)
  assert.match(emptySource, /export function LoadingDiscoveryDeck/)
  assert.match(lobbySource, /refreshInFlightRef\.current/)
})

test("production Discover error surfaces stay actionable without raw diagnostics", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")

  assert.match(lobbySource, /import \{ getDiscoveryErrorMessageForDisplay \} from "\.\.\/features\/discovery\/discoveryErrorCopy"/)
  assert.match(lobbySource, /getDiscoveryErrorMessageForDisplay\("load", productionDiscoveryQuery\.error\)/)
  assert.match(lobbySource, /getDiscoveryErrorMessageForDisplay\("refresh", error\)/)
  assert.match(lobbySource, /getDiscoveryErrorMessageForDisplay\("decision", error\)/)
  assert.match(lobbySource, /error instanceof DiscoveryDecisionQuotaExhaustedError[\s\S]*?"Today’s Discover limit reached"/)
  assert.doesNotMatch(lobbySource, /error\.message/)
})

test("production discovery waits for account-scoped persisted filters", () => {
  const lobbySource = read("src/screens/LobbyScreen.tsx")

  assert.match(lobbySource, /filterPreferencesGenerationRef/)
  assert.match(lobbySource, /filtersReadyForUserId === sessionActor\.profile\.userId/)
  assert.match(lobbySource, /if \(!isProductionDiscovery \|\| !filtersReady\) return/)
  assert.match(lobbySource, /generation !== filterPreferencesGenerationRef\.current/)
  assert.match(lobbySource, /filterPreferencesGenerationRef\.current \+= 1[\s\S]*?setFiltersReadyForUserId\(sessionActor\.profile\.userId\)/)
})
