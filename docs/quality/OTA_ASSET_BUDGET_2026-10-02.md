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

The result after the atlas change is recorded in the section below.
