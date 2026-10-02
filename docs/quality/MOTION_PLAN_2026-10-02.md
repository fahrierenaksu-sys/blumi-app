# Blumi motion and transitions plan (2026-10-02)

Araştırma girdisidir, karar değildir. Bu belge yazılırken repoda hiçbir dosya değiştirilmedi. Hiçbir madde telefonda denenmedi (**Native verified değil**). Tarihli bir anlık görüntüdür; güncel kod önceliklidir.

## Sahip için kısa özet

**Bugün durum ne?** Temel sağlam:
- Alt sekmeler arasında parmakla kaydırma akıcı yazılmış.
- Keşfet kartı eğiliyor, parmağın hızıyla gidiyor ve eşiği geçince titreşim veriyor.
- Titreşim haritası ve "Hareketi Azalt" ayarı her yerde uygulanıyor.

Uygulama yine de henüz "vay be" dedirtmiyor. Nedenleri:
1. **His her yerde aynı değil.** Animasyonların yaklaşık yarısı eski ve daha yavaş bir sistemde. Uygulama meşgulken düğmeye basınca küçülme gecikiyor. Ortak "yumuşak basış" parçası şimdilik yalnızca mağaza kartında kullanılıyor.
2. **Ekran geçişleri karışık.** Örneğin Gardırop solarak açılıyor, ama kayarak kapanıyor.
3. **Akılda kalan büyük anlar hiç yok.** Eşleşmede iki karakterin buluşması, davetten odaya "kapı açılır gibi" geçiş, satın alınan kıyafetin karaktere uçması gibi anlar henüz yapılmadı.
4. **Alttan açılan paneller iPhone'un kendi panelleri değil.** Filtre ve şikâyet panelleri iPhone'daki gibi tutunma noktalı değil, arkadaki ekran da geri çekilmiyor.
5. **Açılışta yazı tipi bir an değişiyor.** İlk karede yazılar farklı fontta görünüp sonra düzeliyor.
6. **Sohbette klavye parmağı takip etmiyor.** iMessage'daki gibi akmıyor.
7. **Odada hareket yapay.** Karakter ayağını kaydırarak yürüyor, oturma ve kalkma tek karede oluyor, ortak odada karakterler eşyaların hep önünde çiziliyor.

**Öneri, üç dalga:**
- **Dalga 1 (1–2 hafta, yeni uygulama sürümü gerekmez):**
  - Tek bir "hareket dili" kurulur: yaylanma ayarları, süreler, titreşim kuralları.
  - Bütün düğmeler aynı yumuşak basış hissine geçer.
  - Ekran geçişleri düzeltilir.
  - Paneller iPhone'un kendi paneline taşınır.
  - Yükleme ekranlarından içeriğe yumuşak geçilir.
  - Keşfet destesinde arkadaki kart yaylanarak öne gelir.
  - Mesaj gönderince balon yazma kutusundan yerine uçar.
- **Dalga 2 (2–4 hafta, yeni sürüm gerekmez):** Akılda kalan büyük anlar ve oda hareketlerinin düzeltilmesi.
  - Eşleşmede iki karakter buluşur.
  - Davet kartı büyüyüp odaya dönüşür, partner kapıdan girer.
  - Satın alınan kıyafet karaktere uçar, coin sayarak düşer.
  - Odada adım adım yürüme, yumuşak oturma ve doğru derinlik.
- **Dalga 3 (tek bir yeni TestFlight sürümü, senin onayınla):**
  - Fontlar uygulamanın içine gömülür.
  - Sohbet klavyesi parmakla birlikte akar.
  - İstersen daha ileri efektler eklenir: Skia (ışık, parıltı, bulanıklık) ve iOS 26'nın cam görünümü.

**Senden gereken kararlar:**
- Dalga 3'teki yeni sürümün zamanı.
- Karakterlerin çizili görünümüne dokunan bir değişiklik olursa (yeni poz gibi), önce görsellere bakıp onay vermen.

**Ölçüm:** Bulutta simülatör olmadığı için akıcılık senin Mac'inde ve telefonunda ölçülecek. Her dalgada önce ve sonra ölçüp sayıları kaydedeceğiz.

---

## Technical appendix (English, for implementers)

Paths are relative to `apps/mobile/src/` unless noted.

### A. Current motion inventory and verified jank sources

**Tokens**
- `ui/theme.ts:190-211` holds legacy damping/stiffness springs (`spring`, `springBouncy`, `springGentle`) next to newer perceptual springs: `springSnappy` 350/0.85, `springGentleTimed` 500/1, `springCelebrate` 550/0.7, plus `staggerMs: 35`.
- The newer tokens are barely used (SYS-08).
- The pager has its own critically damped spring (`navigation/mainTabPager/mainTabPagerConfig.ts`).

**Hooks**
- `ui/animations.ts` is entirely RN `Animated` started from JS (native driver): `useEntranceAnimation`, `usePulse`, `useScaleBounce`, `useSelectionTransition`.
- Starting from JS means a busy JS thread delays the animation start.
- Count: about 30 `.tsx` files still use RN `Animated` without Reanimated; 67 files use Reanimated.

**Reduce Motion**
- One shared, fail-closed store (`ui/reducedMotionStore.ts`), read through `ui/animations.ts`. This is the correct design.

**Haptics**
- `ui/haptics.ts` documents the haptic map. SYS-12 drift is only partly fixed.

**Navigation**
- Root stack fades for 240 ms (`navigation/rootNavigationModel.ts:14`).
- Detail routes use the native push (`DETAIL_SCREEN_OPTIONS`). ChatThread adds a full-screen swipe-back.
- **Open bug (SYS-01):** `WardrobeV2` at `navigation/RootNavigator.tsx:779-782` has only `{ headerShown: false }`, so it opens with the fade and closes with the native slide. One-line fix: use `detailScreenOptions`.
- Deferred screen bundles are preloaded when idle (`navigation/deferredScreenBundles.tsx`).

**Pager**
- Implementation is good: UI-thread drag, velocity projection, `isSelected` boolean props, stable `renderPagerPage` (`RootNavigator.tsx:593`), per-page focus hub.
- `freezeOnBlur` appears nowhere (UXM-01). With a detail screen pushed, all four pages can still re-render.

**Lists**
- Inbox: FlatList with `itemLayoutAnimation`, `windowSize`, `removeClippedSubviews`.
- Chat: inverted FlatList with `keyboardDismissMode="interactive"`, a memoized row, and a Reanimated `entering` for new rows.
- Still open: CHT-02 (toast covers the composer), CHT-03 (34 pt gap above the keyboard), CHT-10 (list jumps when a thread moves to the top), CHT-12 (load-earlier is button-only and re-renders every row).

**Sheets**
- `components/DiscoverFiltersBottomSheet.tsx:115` is an RN `Modal` with `animationType="slide"`. `components/ReportModal.tsx:203` is also an RN `Modal`.
- `ui/SwipeDismissSheet.tsx` has a `presentation="self"` mode that no screen uses (ONBV-06).

**Remaining JS-thread or legacy motion**
- `LayoutAnimation` in `features/miniRoom/scene/useMiniRoomKeyboard.ts:43` and `MiniRoomScene.tsx:305` (ROOM-15).
- `ui/toast.tsx`, `components/MatchResultModal.tsx` and `features/chat/thread/ChatComposer.tsx` still use RN `Animated`.
- Onboarding greeting timers (ONBV-03).
- A 600 ms heavy pre-mount render and about 60 MB of decoded memory growth (ONBV-09).

**Fonts (FONT-1, still open)**
- `App.tsx:65` loads six Inter weights at runtime. `app.json` includes `expo-font` without the `fonts` option.

**Babel**
- `babel.config.js` adds `react-native-reanimated/plugin`, which is a re-export of `react-native-worklets/plugin`.
- `babel-preset-expo` already adds the worklets plugin automatically (`node_modules/babel-preset-expo/build/configs/expo.js:96-101`), so it is probably applied twice. Verify, then remove the explicit entry.
- The React Compiler is off. `babel-plugin-react-compiler` 1.0.0 is already in `node_modules`.

**120 Hz**
- Expo's base Info.plist sets `CADisableMinimumFrameDurationOnPhone: true` (`@expo/config-plugins/build/plugins/withIosBaseMods.js:138`). Confirm in the archived Info.plist.
- Reanimated springs are time-based, so they scale to ProMotion.

**Room renderer**
- `features/avatarV2/room/components/RoomAvatarRenderer2D.tsx` advances frames with a UI-thread `useFrameCallback` and switches stacked `expo-image` slots by opacity. Correct for frame pacing, but memory-heavy (layers × frames).
- Mechanical defects VIS-01..06 (sit height, 0 ms sit/stand swap, foot sliding, MiniRoom depth order) are documented in `docs/quality/ROOM_AVATAR_VISUAL_DIRECTION_2026-10-01.md`.

### B. Blumi motion system: one module, used everywhere

Create `ui/motion.ts`: tokens plus `useMotion()`, which returns tokens already resolved for Reduce Motion. Delete the legacy damping/stiffness tokens. Springs use Reanimated's `{ duration, dampingRatio }`, mapped from SwiftUI presets (dampingRatio ≈ 1 − bounce; SwiftUI's default duration is 0.5 s).

| Token | Value | Use |
|---|---|---|
| `press` | 220 ms / 0.9 | press in/out, toggles |
| `snappy` (SwiftUI .snappy) | 350 ms / 0.85 | selection, pills, badges, card promotion |
| `smooth` (.smooth) | 450 ms / 1.0 | sheets, panels, page and overlay settle |
| `bouncy` (.bouncy) | 550 ms / 0.7 | celebrations only (match, unlock, purchase landing) |
| `pager` | existing critically damped spring | pages |
| `fadeIn` / `fadeOut` | 180 / 140 ms ease-out | opacity only |
| `crossfade` | 200 ms | skeleton → content, Reduce Motion substitute |
| `stagger` | 30 ms, at most 6 items, first appearance only | lists |

**Choreography rules** (add these to `ENGINEERING_RULES.md`):
1. Whatever the finger touched moves first.
2. A gesture hands off to a spring that inherits the release velocity. Never a fixed-duration timing after a gesture.
3. Exits run about 0.7× the enter duration.
4. One hero per moment. Everything else only fades.
5. Animate only transform and opacity. Never animate `width`, `height`, `top` or `left` (ONBV-05 and ROOM-15 break this rule).
6. Haptics fire on the contact or landing frame (`scheduleOnRN` from the spring callback or a threshold), not on the tap.
7. Every animation must be interruptible.
8. Never show a spinner where a skeleton fits. Skeleton to content is a crossfade.

**Haptic map additions:**
- `ImpactFeedbackStyle.Soft` for receiving a message and for the partner's avatar arriving.
- `Rigid` for the editor snap-to-grid tick.
- Message send: `selection`.
- Purchase landing: `success`.
- Keep the rule of one haptic per action.

**Reduce Motion policy:**
- Replace movement (translate, scale, parallax, flight, flip) with a 200 ms crossfade.
- Keep haptics, progress indicators and avatar idle frame cycling.
- Bounded pulses rest at scale 1.
- Keep the fail-closed store.

### C. Architecture for 60/120 fps

1. **Everything on the UI thread.**
   - Rewrite `ui/animations.ts` hooks on Reanimated, or use Reanimated 4 CSS transitions for state-driven changes and shared values for gestures and scroll.
   - Migrate the 30 RN `Animated` files in batches. Toast, MatchResultModal and ChatComposer go first.
   - Replace the source-text contract tests in the same commits (AGENTS rule).
2. **One `PressableScale`** (Gesture Handler `Tap`, worklet `onBegin`/`onFinalize`, the `press` token), adopted everywhere. Add `borderCurve: "continuous"` to cards, buttons and bubbles (CONS-1).
3. **Mount and prefetch.**
   - On `onPressIn` of a navigation target, call the bundle `preload()` and `ExpoImage.prefetch` the target's first-frame assets; the infrastructure already exists in `features/performance/sceneAssetWarmupModel.ts`. That gains about 100 ms before `onPress`.
   - Keep `transition={0}` for bundled PNGs.
   - Lift MyRoom's veil only after the shell and slot-0 `onDisplay` (ROOM-16).
4. **Freeze.** Use `freezeOnBlur` on the pager slot route while a detail screen is pushed (UXM-01). Measure swipe-back for blank frames first. Pause ambient loops on unfocused pages through the focus hub.
5. **React Compiler.** Try it on a branch: `experiments.reactCompiler: true`. Profile render counts and run all worklet-closure tests, because the compiler and worklets interact.
6. **Lists.**
   - Keep FlatList for Inbox.
   - For chat, choose between `react-native-keyboard-controller`'s `KeyboardChatScrollView` (native) and FlashList v2. FlashList v2 is JS-only and New Architecture-only; check `npx expo-fingerprint` to see whether it changes the native fingerprint.
7. **Sheets.** Move filters, report and country picker to native-stack `presentation: "formSheet"` with `sheetAllowedDetents` and `sheetGrabberVisible`. `react-native-screens` 4.26 is already installed, so this is JS-only. Route params must stay serialisable.
8. **Shared-element feel.** Reanimated SET is still experimental and behind a static flag; recent fixes still involve return transitions and cancelled back-swipes. Instead, build a root `FlightLayer` portal: `measure()` the source, animate a clone to the target frame with a spring, and mount the target route with `animation: "none"` underneath. One primitive serves match, invite → room, purchase → avatar and chat send.
9. **Room.** Do VIS-01..05 (procedural sit/stand, stride-locked walk, MiniRoom depth sorting) as Option A from the visual-direction doc. JS-only.

### D. Top 15 "vay be" moments

| # | Screen | Moment | How | Effort | Build |
|---|---|---|---|---|---|
| 1 | Discover → Match | Two chibis meet | FlightLayer carries the card's chibi to the match position; partner slides in from the right; heart line draws (`scaleX`, 280 ms); `success` haptic on contact; reduced confetti | M | JS |
| 2 | Discover | Living deck | Card role as a shared value with `snappy` promotion; frost opacity tied to the same progress (DISC-2, DSC-11); real 3D flip with `perspective` + `rotateY` (DSC-07) | S–M | JS |
| 3 | Discover | Button like/pass feels thrown | Button exit uses arc + rotation and the same velocity model as a swipe; failure springs the card back with an error haptic (MICRO-5) | S | JS |
| 4 | Chat send | Bubble flies into place | Measure the composer text, fly a clone to the new row's frame while morphing the radius, then reveal the row; send button scales from 0.8 to 1; `selection` haptic | M | JS |
| 5 | Chat receive and typing | Typing dots become the bubble | Dots container morphs into the incoming bubble (`LinearTransition`); `Soft` haptic only when not focused | S–M | JS |
| 6 | Chat keyboard | Composer glued to the keyboard, interactive dismiss | `react-native-keyboard-controller` (`KeyboardChatScrollView`); also fixes CHT-03 | M | **Native** |
| 7 | Invite → MiniRoom | "Door opens" | Invite card flies to full screen (radius 22 → 0), room crossfades in, partner walks in from the door, `Soft` haptic on arrival (SIG-01 B) | L | JS |
| 8 | MiniRoom | Grounded avatars | Depth sorting (VIS-04), avatars turn toward each other when close, small heart on tap; camera moves with keyboard via Reanimated instead of `LayoutAnimation` (ROOM-15) | M | JS |
| 9 | My Room | Natural sit, stand and walk | VIS-01..03: anticipation → drop → settle (360–480 ms), stride-locked frames, bob and contact shadow | M | JS |
| 10 | Room editor | Apple-quality lift and drop | Lift: scale 1.04, shadow grows, `Medium` haptic. Drag: grid ticks with `Rigid`. Drop: squash and settle plus contact glow, `light` haptic. Invalid: spring back plus `error` haptic. Springs on zoom and undo (ROOM-12) | M | JS |
| 11 | Wardrobe and shop try-on | Outfit pops on | Old layer crossfades out, avatar hops 0.97 → 1 with `bouncy`, single `selection` haptic | S | JS |
| 12 | Shop purchase | Item flies to avatar, coins count down | Starts only after server confirmation (economy stays server-authoritative); FlightLayer thumbnail → avatar; coin odometer; `success` on landing; single checkout sheet (SIG-01 C) | M | JS |
| 13 | Tab switching | Liquid tab pill | The existing UI-thread indicator stretches with pager velocity (width from `abs(dPosition)`) and settles with `snappy`; badge pops at 0 → n. Optional iOS 26 glass bar via `expo-glass-effect` | S (+M) | JS (glass: **native**) |
| 14 | Onboarding | "You did it" | After account creation, the user's own avatar appears in their room, then zooms into Discover (ONB-13); scan grid folds into the first card | M | JS |
| 15 | Global | Consistent press feel, native sheets, skeleton crossfades | `PressableScale` everywhere, formSheet with detents, chat skeleton (UXO-03), MyRoom veil after first paint, Wardrobe push fix (SYS-01) | M | JS |

Profile: scroll-driven header collapse and avatar parallax (`useScrollViewOffset`), and tap-the-avatar-to-wave (S, JS). This fits under #15.

### E. How to measure without a cloud simulator

**In the cloud (every change):**
- Render-count tests in the style of `navigation/mainTabRenderIsolation.test.ts`.
- `mobile-ui-thread-motion-contract` and `mobile-worklet-closure` tests.
- Bundle-size test.
- A new test that fails when a motion literal is not a token.

**On the Mac or a device (release build):**
- Xcode Instruments: Animation Hitches template and the Core Animation FPS gauge.
- RN Perf Monitor in the dev client (UI fps against JS fps).
- React DevTools Profiler for commit counts per interaction.
- Run each journey (cold start → Discover, swipe ×10, match, chat send ×10, invite → MiniRoom, editor drag, tab spam) as a Maestro flow so before and after runs repeat exactly.
- Flashlight is Android-only, so use it only on an Android build for CPU and FPS scores.

**In the field:**
- Sentry RN 7.11 is installed. Enable native slow and frozen frame tracking plus screen-load spans, with only allowlisted route names (crash-privacy rule).

**Budgets:**
- Hitch ratio under 5 ms/s.
- No frame over 33 ms during a transition.
- JS fps of 55 or more during navigation.
- Visual response to a press within one frame.
- Cold-start text never changes font.

### F. Native build vs JS-only

**Needs a new native build, so put them all in one owner-approved TestFlight:**
- FONT-1: embed fonts with the `expo-font` `fonts` option.
- `react-native-keyboard-controller`.
- `@shopify/react-native-skia`, only version 2.11.1 or later. Expo SDK 57 bundles 2.6.2, which is broken on RN 0.86 Android (expo/expo#50701). Add Skia to `UI_SAFE_PACKAGES`.
- Rive: the new Nitro runtime also needs `react-native-nitro-modules`.
- `expo-glass-effect`.
- `@expo/ui` for an iMessage-style context menu.
- Turning on Reanimated's static SET flag.

**JS-only:** everything else in section D, plus formSheet, React Compiler, the motion tokens, `PressableScale`, the FlightLayer and the room VIS work. FlashList v2 is probably JS-only too; confirm with the fingerprint.

OTA is paused because of the roughly 1,220-asset cap (REL-01), so in practice JS-only work also reaches users through the next TestFlight until REL-01 is fixed.

### G. Risks

- **Over-animation.** In a dating app that feels childish. Limit to one hero per moment, and use `bouncy` only for celebrations.
- **Memory and thermal.** Stacked PNG frames (ONBV-09 already shows about 60 MB growth) and blur. Budget memory per screen on the device.
- **Gesture conflicts** with the pager. Use the existing ownership model in `ui/MainTabPagerGestureOwnership.tsx`.
- **`freezeOnBlur`** may cause blank frames on swipe-back.
- **React Compiler and worklets** together.
- **Contract tests.** Source-text contract tests must be replaced, not deleted.
- **Two-phone sync** for room motion (MR-05: corners chained through `scheduleOnRN`).
- **Skia on Android.**
- **Experimental SET.** Avoid it.
- **Approvals.** Any new pose or frame goes through the character asset gate and needs the owner to see the visuals first. Shipping native dependencies needs the owner's build approval.

### Sources
- [Reanimated 4.2.0: SET on the New Architecture behind a flag](https://blog.swmansion.com/introducing-reanimated-4-2-0-71eea21ca861)
- [Reanimated CSS transitions overview](https://docs.swmansion.com/react-native-reanimated/docs/css-transitions/overview/)
- [Callstack Reanimated guidance](https://github.com/callstackincubator/agent-skills/blob/main/skills/react-native-best-practices/references/js-animations-reanimated.md)
- [Reanimated SET fix PR #10786](https://github.com/software-mansion/react-native-reanimated/pull/10786)
- [Native Stack Navigator (formSheet)](https://reactnavigation.org/docs/native-stack-navigator/)
- [RN Screens 4.0 formSheet and detents](https://swmansion.com/blog/introducing-react-native-screens-4-0-0-1b833ff98a55/)
- [Expo issue #50701: Skia 2.6.2 and RN 0.86](https://github.com/expo/expo/issues/50701)
- [React Native 0.86 release](https://reactnative.dev/blog/2026/06/11/react-native-0.86)
- [Expo React Compiler guide](https://docs.expo.dev/guides/react-compiler/)
- [FlashList v2](https://shopify.engineering/flashlist-v2)
- [FlashList v2 changes](https://shopify.github.io/flash-list/docs/v2-changes/)
- [Rive Nitro runtime](https://github.com/rive-app/rive-nitro-react-native)
- [Rive with Expo](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo)
- [WWDC23 "Animate with springs"](https://wwdcnotes.com/documentation/wwdc23-10158-animate-with-springs/)
- [SwiftUI spring presets](https://github.com/GetStream/swiftui-spring-animations)
- [Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/)
- [Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
- [Flashlight](https://github.com/bamlab/flashlight)
- [keyboard-controller KeyboardChatScrollView](https://kirillzyusko.github.io/react-native-keyboard-controller/blog/chat-scroll-view)