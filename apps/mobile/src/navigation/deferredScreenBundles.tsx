import { type ComponentType } from "react"

export interface DeferredScreenBundle {
  DeferredScreen: ComponentType<any>
  preload: () => ComponentType<any>
}

export function createDeferredScreen(
  loader: () => ComponentType<any>
): DeferredScreenBundle {
  let cachedComponent: ComponentType<any> | null = null

  const preload = (): ComponentType<any> => {
    if (!cachedComponent) cachedComponent = loader()
    return cachedComponent
  }

  function DeferredScreen(props: any) {
    // Resolve synchronously on the route's first render. The previous
    // effect-driven resolution painted a generic fallback for one or more
    // frames, then replaced it with the real screen after the module loaded;
    // that was the visible jump after Whoa -> profile.
    const Component = preload()
    return <Component {...props} />
  }

  return { DeferredScreen, preload }
}

export const myRoomScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/MyRoomScreen").MyRoomScreen as ComponentType<any>
)
export const registerScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/RegisterScreen").RegisterScreen as ComponentType<any>
)
export const preAuthSetupFlowScreenBundle = createDeferredScreen(
  () =>
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
    require("../screens/PreAuthSetupFlowScreen")
      .PreAuthSetupFlowScreen as ComponentType<any>
)
export const profileSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/ProfileSetupScreen").ProfileSetupScreen as ComponentType<any>
)
export const avatarSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/AvatarSetupScreen").AvatarSetupScreen as ComponentType<any>
)
export const roomSetupScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/RoomSetupScreen").RoomSetupScreen as ComponentType<any>
)
export const wardrobeV2ScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/WardrobeV2Screen").WardrobeV2Screen as ComponentType<any>
)
export const cosmeticShopScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/CosmeticShopScreen").CosmeticShopScreen as ComponentType<any>
)
export const myRoomEditorScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/MyRoomEditorScreen").MyRoomEditorScreen as ComponentType<any>
)
export const miniRoomRigPreviewScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/MiniRoomRigPreviewScreen").MiniRoomRigPreviewScreen as ComponentType<any>
)
export const homeStudioScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("@blumi/home-studio-qa").HomeStudioScreen as ComponentType<any>
)
export const settingsScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/SettingsScreen").SettingsScreen as ComponentType<any>
)
export const legalScreenBundle = createDeferredScreen(
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  () => require("../screens/LegalScreen").LegalScreen as ComponentType<any>
)

export function preloadDeferredMainScreens(): void {
  myRoomScreenBundle.preload()
  wardrobeV2ScreenBundle.preload()
  cosmeticShopScreenBundle.preload()
  myRoomEditorScreenBundle.preload()
  settingsScreenBundle.preload()
  legalScreenBundle.preload()
}

export function preloadDeferredAuthScreens(): void {
  registerScreenBundle.preload()
  preAuthSetupFlowScreenBundle.preload()
  profileSetupScreenBundle.preload()
  avatarSetupScreenBundle.preload()
  roomSetupScreenBundle.preload()
}

export function preloadDeferredAuthenticatedOnboardingScreens(): void {
  profileSetupScreenBundle.preload()
  avatarSetupScreenBundle.preload()
  roomSetupScreenBundle.preload()
}
