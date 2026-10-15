import { createDeferredScreen } from "./deferredScreen"

export { createDeferredScreen, type DeferredScreenBundle } from "./deferredScreen"

export const myRoomScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/MyRoomScreen") as typeof import("../screens/MyRoomScreen")).MyRoomScreen
)
export const registerScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/RegisterScreen") as typeof import("../screens/RegisterScreen")).RegisterScreen
)
export const preAuthSetupFlowScreenBundle = createDeferredScreen(
  () =>
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
    (require("../screens/PreAuthSetupFlowScreen") as typeof import("../screens/PreAuthSetupFlowScreen")).PreAuthSetupFlowScreen
)
export const profileSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/ProfileSetupScreen") as typeof import("../screens/ProfileSetupScreen")).ProfileSetupScreen
)
export const avatarSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/AvatarSetupScreen") as typeof import("../screens/AvatarSetupScreen")).AvatarSetupScreen
)
export const roomSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/RoomSetupScreen") as typeof import("../screens/RoomSetupScreen")).RoomSetupScreen
)
export const wardrobeV2ScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/WardrobeV2Screen") as typeof import("../screens/WardrobeV2Screen")).WardrobeV2Screen
)
export const cosmeticShopScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/CosmeticShopScreen") as typeof import("../screens/CosmeticShopScreen")).CosmeticShopScreen
)
export const myRoomEditorScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/MyRoomEditorScreen") as typeof import("../screens/MyRoomEditorScreen")).MyRoomEditorScreen
)
export const settingsScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/SettingsScreen") as typeof import("../screens/SettingsScreen")).SettingsScreen
)
export const legalScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => (require("../screens/LegalScreen") as typeof import("../screens/LegalScreen")).LegalScreen
)

export function preloadDeferredMainScreens(): void {
  myRoomScreenBundle.preload()
  wardrobeV2ScreenBundle.preload()
  cosmeticShopScreenBundle.preload()
  myRoomEditorScreenBundle.preload()
  settingsScreenBundle.preload()
  legalScreenBundle.preload()
}

/**
 * Warms screen modules ahead of navigation. These run from effects outside any
 * route error boundary, so a module that throws while loading must not take
 * the whole app down here; it fails again on the route's own render, where
 * that route's boundary shows it.
 */
function warmScreenBundles(bundles: readonly { preload: () => unknown }[]): void {
  for (const bundle of bundles) {
    try {
      bundle.preload()
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[Blumi] A deferred screen failed to preload.",
          error instanceof Error ? error.message : error
        )
      }
    }
  }
}

export function preloadDeferredAuthScreens(): void {
  warmScreenBundles([
    registerScreenBundle,
    preAuthSetupFlowScreenBundle,
    profileSetupScreenBundle,
    avatarSetupScreenBundle,
    roomSetupScreenBundle
  ])
}

export function preloadDeferredAuthenticatedOnboardingScreens(): void {
  warmScreenBundles([
    profileSetupScreenBundle,
    avatarSetupScreenBundle,
    roomSetupScreenBundle
  ])
}
