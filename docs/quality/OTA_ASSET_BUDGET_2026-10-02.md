# OTA asset budget (2026-10-02)

EAS Update refuses an update with more than 1,000 assets. Develop OTAs are paused until the iOS bundle fits (`docs/release/OTA_AND_TESTFLIGHT.md`). This note records the measured count and where it comes from.

## How it was measured

`npx expo export --platform ios --dump-assetmap` from `apps/mobile`, offline, with the `preview` profile environment from `eas.json` (placeholder HTTPS/WSS URLs, which change no asset). The count is `fileMetadata.ios.assets` in the exported `metadata.json`, which is the list `eas update` uploads. Metro bundles only files that are `require()`d from the app entry and stores identical bytes once, so this is the exact number EAS sees.

## Before (develop `80dea5b`)

**1,210 iOS assets.** By folder (`apps/mobile/` paths; the rows add up to 1,213 because three files appear under two folders with identical bytes):

| Folder | Assets | Of which bound by a published-item receipt |
|---|---:|---:|
| `src/features/avatarV2/assets/room/motion` (room walk and sit frames) | 710 | 374 |
| `src/features/avatarV2/assets/room` (room idle layers) | 198 | 108 |
| `src/features/avatarV2/assets/layers` | 97 | 47 |
| `src/features/avatarV2/assets/shop-thumbnails` | 84 | 45 |
| `@expo/vector-icons` fonts | 19 | |
| `@react-navigation/elements` icons (@1x/@2x/@3x) | 19 | |
| `src/features/session/assets/*` (onboarding, profile, register art) | 46 | |
| `src/features/roomV2/assets/*` and `src/features/miniRoom/assets/*` | 29 | |
| `assets/ui`, `assets/brand`, Inter fonts | 11 | |

586 assets are bytes that a receipt in `packages/domain/src/release/blumiR1ReleaseCatalog.json` binds (`shopReleaseCatalog.test.ts` hash-locks them and the resolvers that point at them). They cannot move without new owner-approved receipts, so 624 assets are movable at most.

## Where the reduction comes from

The 336 room motion frames that no receipt binds (425 files, 359 distinct images, all 256×384) are packed into a few sprite atlases, one family per layer type. Every frame of those files has only fully transparent pixels outside its opaque bounds (RGBA 0,0,0,0), so a trimmed crop plus 4 px of transparent padding reproduces each frame exactly. Their trimmed, padded area is about 3.1 million pixels in total (about 12 MB decoded for all of them together), against 0.39 MB decoded per untrimmed frame today.

Published items keep their individual PNGs, so every receipt stays valid.

The remaining candidates were checked and left alone: the onboarding runner sets in `src/features/session/assets` are all still reachable from `onboardingRunAssetCatalog.ts`, and the idle room layers double as Shop preview sources (`shopAssets.ts`), so they are not provably unused.

## After the atlas change

**888 iOS assets** (same export, same environment): 1,210 − 336 frames + 14 atlases. Room motion is now 374 individual receipt-bound frames plus 14 atlases in `src/features/avatarV2/assets/room/motion-atlas`. Headroom under the EAS limit: 112.

- Generator: `node apps/mobile/scripts/build-room-motion-atlases.mjs` (sharp, from the repo PNGs only; rerunning it reproduces the same bytes). After promoting new room motion art, add its `require()` lines as usual and run it with `--rewrite-requires`: frames that no receipt binds are packed and their requires become `roomAvatarMotionAtlasFrame("<name>")`.
- Renderer: `RoomAvatarRenderer2D` clips each packed frame out of its atlas at the exact place `contentFit="contain"` would draw the 256×384 frame; frame timing, slots, readiness, layering and mirroring are unchanged.
- Proof: `roomAvatarMotionAtlas.test.ts` composites all 425 packed frames from their atlases and compares them with the original PNGs: byte-exact RGBA equality for every frame, and every crop edge is transparent. `scripts/mobile-ota-asset-budget.test.mjs` fails once the app's required assets plus a 60-asset package allowance come within 50 of 1,000 (today: 863 + 60 = 923, an upper bound of the real 888).

Decoded memory (RGBA, before any expo-image downscale): the 14 atlases are 11.5 MB together; the largest is the male tops atlas, 1024×808 (3.2 MB), then female tops 1012×608 (2.3 MB) and female hair 956×444 (1.6 MB); the rest are under 1 MB. One untrimmed frame was 0.375 MB, so one walking layer used to hold 1.5 MB for its four frames per avatar. A fully packed female outfit now touches about 6.6 MB of atlases, shared by every avatar on screen, against about 13.5 MB per avatar before. A single male avatar wearing one packed top holds the whole 3.2 MB tops atlas instead of 1.5 MB.

On device the frame's pixels are the same, but they are resampled from a different image, so sub-pixel anti-aliasing at the frame edges can differ by less than one device pixel. That is not visible in tests and needs a look on the phone.
