import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  if (relativePath === "src/screens/LobbyScreen.tsx") {
    return readFileSync(resolve(mobileRoot, "src/screens/LobbyScreen.tsx"), "utf8") +
      "\n" + readFileSync(resolve(mobileRoot, "src/features/lobby/useLobbyFlow.ts"), "utf8")
  }
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("production match flow leads from Discover to chat without a room promise", () => {
  const matchResult = read("src/screens/MatchResultScreen.tsx")
  const matchModal = read("src/components/MatchResultModal.tsx")
  const lobby = read("src/screens/LobbyScreen.tsx")

  assert.match(matchResult, /You two just matched\./)
  assert.match(matchResult, /Start with a message and get to know each other at your pace\./)
  assert.doesNotMatch(matchResult, /canEnterSharedRoom|SharedMatchRoom|Go to Room/)
  assert.match(lobby, /showDiscoverFeedback\("Like sent\.", "warm"\)/)
  assert.doesNotMatch(lobby, /We’ll open a room if it’s mutual\./)
  assert.match(lobby, /if \(isProductionDiscovery\) \{\s*clearReadyMiniRoom\(\)\s*return/)
  assert.match(lobby, /\{!isProductionDiscovery && incomingInvite && senderDisplayName \? \(/)
  assert.match(matchModal, /onSendMessage: \(\) => void/)
  assert.match(matchModal, /<PrimaryButton\s+label="Start chatting"\s+onPress=\{onSendMessage\}/)
  assert.match(matchModal, /<SecondaryButton\s+label="Keep exploring"\s+onPress=\{onKeepDiscovering\}/)
  assert.doesNotMatch(matchModal, /onViewSaved|Go to Room|head into the room/)
  assert.match(matchResult, /<ReportModal/)
  assert.match(matchResult, /Safety options for \$\{match\.matchedUser\.displayName\}/)
})

test("chat opens a conversation first and renders room invitations as explicit timeline cards", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(chat, /This conversation is still getting ready\./)
  assert.match(chat, /Opening your chat\.\.\./)
  assert.match(chat, /buildChatTimeline/)
  assert.match(chat, /<ChatRoomInviteCard/)
  assert.doesNotMatch(chat, /Start a live room from Discover\./)
})

test("chat keeps the room invitation entry visible and explains unavailable states", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(chat, /const roomInviteDisabledReason =/)
  assert.match(chat, /Alert\.alert\([\s\S]*?chatCopy\.roomInviteUnavailableTitle,[\s\S]*?roomInviteDisabledReason \?\? chatCopy\.roomInviteUnavailableReason/)
  assert.match(chat, /accessibilityState=\{\{[\s\S]*?disabled:\s*isCreatingRoomInvite[\s\S]*?\}\}/)
  assert.doesNotMatch(chat, /\{canCreateRoomInvite && createRoomInviteAction \? \(/)
})

test("loading earlier messages preserves the current chat scroll position", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(chat, /preserveScrollOnNextHistoryLoadRef\.current = true/)
  assert.match(chat, /const isHistoryPrepend =[\s\S]*?preserveScrollOnNextHistoryLoadRef\.current[\s\S]*?newestMessageId === newestMessageIdRef\.current/)
  assert.match(chat, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/)
  assert.match(chat, /onContentSizeChange=\{\(\) => \{[\s\S]*?preserveScrollOnNextHistoryLoadRef\.current = false[\s\S]*?return/)
})

test("chat composer places the guarded room button before the text input", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(chat, /if \(isCreatingRoomInvite\) return/)
  assert.match(chat, /disabled=\{isCreatingRoomInvite\}/)
  assert.match(chat, /<View style=\{styles\.composer\}>[\s\S]*?getRoomInviteCreateLabel[\s\S]*?<View style=\{styles\.inputWrap\}>/)
})

test("chat header keeps the canonical avatar and bubbles use the muted WhatsApp-style palette", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")
  const inviteCard = read("src/features/chat/ChatRoomInviteCard.tsx")

  assert.match(chat, /<Animated\.View style=\{\[styles\.chatHeader, headerAnim\]\}>[\s\S]*?<ParticipantAvatar[\s\S]*?avatar=\{partnerAvatar\}[\s\S]*?size=\{44\}/)
  assert.match(chat, /bubbleMe: \{[\s\S]*?backgroundColor: "#F6E7EB"[\s\S]*?borderColor: "#E8D7DD"/)
  assert.match(chat, /bubbleThem: \{[\s\S]*?backgroundColor: "#FFFDFC"[\s\S]*?borderColor: "#EEE5E8"/)
  assert.match(chat, /tailMe: \{[\s\S]*?backgroundColor: "#F6E7EB"[\s\S]*?borderColor: "#E8D7DD"/)
  assert.match(inviteCard, /colors=\{\["#FFF9FB", "#FFFDFC"\]\}/)
  assert.match(inviteCard, /backgroundColor: "#F8EEF2"/)
})

test("chat localizes core empty, history, composer, and accessibility copy for Turkish", () => {
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(chat, /Opening your chat\.\.\./)
  assert.match(chat, /Sohbetin hazırlanıyor\.\.\./)
  assert.match(chat, /Load earlier/)
  assert.match(chat, /Önceki mesajları yükle/)
  assert.match(chat, /Message…/)
  assert.match(chat, /Mesaj yaz…/)
})

test("production discovery preferences use the authoritative profile path", () => {
  const settings = read("src/screens/SettingsScreen.tsx")
  const navigator = read("src/navigation/RootNavigator.tsx")

  assert.match(settings, /onUpdateProfile/)
  assert.match(settings, /discoveryPreferences:/)
  assert.match(navigator, /onUpdateProfile=\{updateSessionProfile\}/)
})

test("profile decisions use the production API directly and never fall through to legacy invites", () => {
  const lobby = read("src/screens/LobbyScreen.tsx")
  const profile = read("src/screens/ProfilePreviewScreen.tsx")

  assert.match(profile, /const isProductionDiscovery = props\.sessionActor\.session\.mode === "production"/)
  assert.match(profile, /await decideDiscoverProfile\(\s*MOBILE_HTTP_BASE_URL,\s*props\.sessionActor\.session\.sessionToken,\s*profile\.userId,\s*decision/)
  assert.match(profile, /const \[decisionError, setDecisionError\] = useState<string \| null>\(null\)/)
  assert.match(profile, /navigation\.navigate\("Lobby", \{ pendingLikeUserId: profile\.userId \}\)/)
  assert.match(profile, /navigation\.navigate\("Lobby", \{ pendingPassUserId: profile\.userId \}\)/)
  assert.match(profile, /<ReportModal/)
  assert.match(profile, /accessibilityLabel=\{copy\.safetyOptions\(profile\.displayName\)\}/)
  assert.match(lobby, /const target = route\.params\?\.pendingPassUserId/)
  assert.match(lobby, /decideProductionCandidate\(targetUser, "pass"\)/)
  assert.match(lobby, /This profile is no longer available in Discover\./)
})

test("empty inbox and onboarding direct people toward Discover and chat", () => {
  const inbox = read("src/screens/InboxScreen.tsx")
  const welcome = read("src/screens/WelcomeScreen.tsx")
  const register = read("src/screens/RegisterScreen.tsx")
  const authCopy = read("src/features/session/authEntryCopy.ts")
  const inboxCopy = read("src/features/chat/inboxCopy.ts")

  assert.match(inbox, /const handleGoDiscover = useCallback\(\(\) => \{\s*navigation\.navigate\("Lobby"\)/)
  assert.match(inbox, /getInboxCopy\(locale\)/)
  assert.match(inboxCopy, /When a mutual match happens, your conversation starts here\./)
  assert.match(welcome, /Match, then chat/)
  assert.doesNotMatch(welcome, /Match into a private room/)
  assert.match(register, /authCopy\.createCodeBody/)
  assert.match(authCopy, /createCodeBody:\s*"Enter the 6-digit code we sent\. This is the final step before your Blumi world opens\."/)
  assert.match(register, /const progressTotal = authIntent === "create" \? 4 : 2/)
  assert.match(register, /const progressCurrent = authIntent === "create"/)
  assert.match(register, /const primaryDisabled = busy \|\| !primaryEnabled/)
  assert.match(register, /disabled=\{primaryDisabled\}/)
})

test("inbox does not present unverified partner presence", () => {
  const inbox = read("src/screens/InboxScreen.tsx")

  assert.doesNotMatch(inbox, /onlineDotOuter/)
  assert.doesNotMatch(inbox, /onlineDot/)
})

test("onboarding profile review returns to the originating setup step", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")

  assert.match(
    navigator,
    /ProfileSetup:\s*\{\s*reviewReturnTo\?: "AvatarSetup" \| "RoomSetup"\s*\} \| undefined/
  )
  assert.match(navigator, /screenProps\.route\.params\?\.reviewReturnTo \?\? "AvatarSetup"/)
  assert.match(
    navigator,
    /navigation\.navigate\("ProfileSetup",\s*\{\s*reviewReturnTo: "RoomSetup"\s*\}\)/
  )
})

test("deep-linked profile failures stay truthful and recoverable", () => {
  const linkedProfile = read("src/navigation/LinkedProfileScreen.tsx")

  assert.match(linkedProfile, /DiscoveryProfileUnavailableError/)
  assert.match(linkedProfile, /copy\.tryAgain/)
  assert.match(linkedProfile, /copy\.backToDiscover/)
  assert.match(linkedProfile, /onPress=\{\(\) => \{[\s\S]*setRetryNonce\(/)
})

test("Phase 1 copy no longer promises a room outside technical compatibility fields", () => {
  const auth = read("src/screens/AuthEntryScreen.tsx")
  const roomSetup = read("src/screens/RoomSetupScreen.tsx")
  const inbox = read("src/screens/InboxScreen.tsx")
  const chatApi = read("src/features/chat/chatApi.ts")

  assert.doesNotMatch(auth, /make a room people remember/i)
  assert.doesNotMatch(roomSetup, /Set the room people will remember/i)
  assert.doesNotMatch(inbox, /Rooms and chats from mutual matches\.|Opening your rooms…|Room invite sent/)
  assert.doesNotMatch(chatApi, /We could not open that room yet\./)
  assert.match(chatApi, /We could not open that conversation yet\./)
})

test("room setup exposes only the free starter bed and shop does not claim unplaced furniture is placed", () => {
  const roomSetup = read("src/screens/RoomSetupScreen.tsx")
  const shop = read("src/screens/CosmeticShopScreen.tsx")

  assert.match(roomSetup, /FREE STARTER ITEM/)
  assert.match(roomSetup, /Pink Cloud Bed/)
  assert.match(roomSetup, /testID="starter-bed-card"/)
  assert.match(roomSetup, /testID="starter-bed-rotate"/)
  assert.match(roomSetup, /testID="room-setup-submit"/)
  assert.doesNotMatch(roomSetup, /STARTER_ROOM_PRESETS/)
  assert.match(shop, /copy\.readyToPlace/)
  assert.doesNotMatch(shop, /\? "Placed"/)
})

test("shop keeps status and mode controls outside the oversized screen", () => {
  const shop = read("src/screens/CosmeticShopScreen.tsx")
  const controls = read("src/features/shop/ShopNavigationControls.tsx")

  assert.match(shop, /from "\.\.\/features\/shop\/ShopNavigationControls"/)
  assert.doesNotMatch(shop, /function ShopStatusCard|const ShopModeDock = memo/)
  assert.match(controls, /export function ShopStatusCard/)
  assert.match(controls, /export const ShopModeDock = memo/)
})

test("profile copy does not promise post-match room experiences", () => {
  const you = read("src/screens/YouScreen.tsx")

  assert.doesNotMatch(you, /post-match rooms|room experiences/i)
})

test("You keeps one profile action and does not duplicate bottom navigation", () => {
  const you = read("src/screens/YouScreen.tsx")
  const profileRoutes = you.match(/navigation\.navigate\("ProfileEdit"\)/g) ?? []

  assert.equal(profileRoutes.length, 1)
  assert.doesNotMatch(you, /Avatar Identity|Open My Room|<BrandMark/)
  assert.doesNotMatch(you, /👤|🏠|✏️|⚙️|>←</)
  assert.match(you, /Ionicons/)
})

test("production navigation excludes the unreachable Saved Connections screen", () => {
  const navigation = read("src/navigation/RootNavigator.tsx")

  assert.equal(
    existsSync(resolve(mobileRoot, "src/screens/SavedConnectionsScreen.tsx")),
    false
  )
  assert.doesNotMatch(navigation, /import \{ SavedConnectionsScreen \}/)
  assert.doesNotMatch(navigation, /SavedConnections: undefined/)
  assert.doesNotMatch(navigation, /name="SavedConnections"/)
})

test("legacy avatar fallback stays honest and monogram-based", () => {
  const avatar = read("src/ui/avatar.tsx")

  assert.match(avatar, /function deriveInitials\(name: string\): string/)
  assert.match(avatar, /<Text[\s\S]*styles\.initials/)
  assert.doesNotMatch(avatar, /const EYES: string\[]/)
  assert.doesNotMatch(avatar, /const MOUTHS: string\[]/)
  assert.doesNotMatch(avatar, /const BLUSH: string\[]/)
  assert.doesNotMatch(avatar, /const ACCESSORIES: string\[]/)
  assert.doesNotMatch(avatar, /ACCESSORY_GLYPH/)
  assert.doesNotMatch(avatar, /deriveFaceParts/)
})

test("room debrief preserves the mini-room partner avatar snapshot", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const debrief = read("src/screens/RoomDebriefScreen.tsx")
  const miniRoom = read("src/screens/MiniRoomScreen.tsx")

  assert.match(
    navigator,
    /RoomDebrief:\s*\{[\s\S]*partner:\s*\{[\s\S]*userId:\s*string[\s\S]*displayName:\s*string[\s\S]*avatarSnapshot\?:\s*CandidateAvatarSnapshot[\s\S]*\}/
  )
  assert.match(miniRoom, /navigation\.replace\("RoomDebrief", \{[\s\S]*partner:\s*participants\.partner/)
  assert.match(debrief, /partner\.avatarSnapshot \? \(/)
  assert.match(debrief, /<CandidateAvatarPreview/)
  assert.match(debrief, /<Avatar[\s\S]*name=\{partner\.displayName\}[\s\S]*seed=\{partner\.userId\}/)
  assert.doesNotMatch(debrief, /createCandidateAvatarSnapshot/)
})

test("chat surfaces render a canonical participant avatar and keep monograms for missing legacy data", () => {
  const inbox = read("src/screens/InboxScreen.tsx")
  const chat = read("src/screens/ChatThreadScreen.tsx")

  assert.match(inbox, /ParticipantAvatar/)
  assert.match(inbox, /avatar=\{props\.partnerAvatar\}/)
  assert.match(chat, /ParticipantAvatar/)
  assert.match(chat, /avatar=\{partnerAvatar\}/)
  assert.doesNotMatch(chat, /readCandidateAvatarSnapshot\(partnerSummary/)
})

test("MiniRoom uses durable speech bubbles without the legacy reaction UI", () => {
  const screen = read("src/screens/MiniRoomScreen.tsx")
  const scene = read("src/features/miniRoom/scene/MiniRoomScene.tsx")
  const avatarLayer = read("src/features/miniRoom/scene/AvatarLayer.tsx")

  assert.doesNotMatch(screen, /useMiniRoomReactions/)
  assert.doesNotMatch(scene, /recentReactions|canSendReaction|onSendReaction|REACTIONS|reactionDock/)
  assert.doesNotMatch(avatarLayer, /RoomEmote|REACTION_ICON|emoteWrap/)
  assert.match(scene, /ROOM_CHAT_BUBBLE_LIFETIME_MS = 4_000/)
  assert.match(scene, /onDismissBubble/)
})
