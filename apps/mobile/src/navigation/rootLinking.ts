import type { LinkingOptions } from "@react-navigation/native"
import { Linking } from "react-native"
import { captureProductEvent } from "../analytics/productAnalytics"
import { parseReferralCodeFromUrl } from "../features/referrals/referralModel"
import { capturePendingReferral } from "../features/referrals/referralStorage"
import { createPendingDeepLinkStore } from "./pendingDeepLink"
import type { RootStackParamList } from "./RootNavigator"
import { navigationRef } from "./rootNavigationRef"

const ROOT_LINK_SCREENS = {
  Lobby: "discover",
  Inbox: "inbox",
  ChatThread: "chat/:threadId",
  ProfilePreview: "profile/:userId",
  Settings: "settings",
  MyRoom: "room",
  MyRoomEditor: "room/edit",
  WardrobeV2: "wardrobe",
  CosmeticShop: "shop"
} satisfies Partial<Record<keyof RootStackParamList, string>>

/**
 * Deep links for the root stack. Referral links are captured for later
 * attribution and never reach navigation; every other `blumi://` link routes
 * through the path config below. A link that arrives before the unrestricted
 * Main stack can route it is held by `pendingDeepLinks` and replayed once.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["blumi://"],
  config: {
    screens: ROOT_LINK_SCREENS
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL()
    if (!url) return url
    const referralCode = parseReferralCodeFromUrl(url)
    if (!referralCode) return pendingDeepLinks.resolveInitialUrl(url)
    await capturePendingReferral({ code: referralCode })
    captureProductEvent("referral_link_opened", { source: "initial_url" })
    return null
  },
  subscribe(listener) {
    const detachListener = pendingDeepLinks.attachListener(listener)
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const referralCode = parseReferralCodeFromUrl(url)
      if (referralCode) {
        void capturePendingReferral({ code: referralCode })
        captureProductEvent("referral_link_opened", { source: "app_link" })
        return
      }
      pendingDeepLinks.handleUrl(url)
    })
    return () => {
      subscription.remove()
      detachListener()
    }
  }
}

/** The single in-memory pending deep link for the root navigation container. */
export const pendingDeepLinks = createPendingDeepLinkStore({
  prefixes: linking.prefixes,
  screens: ROOT_LINK_SCREENS,
  now: () => Date.now(),
  navigation: {
    isReady: () => navigationRef.isReady(),
    getRouteNames: () => navigationRef.getRootState()?.routeNames
  }
})
