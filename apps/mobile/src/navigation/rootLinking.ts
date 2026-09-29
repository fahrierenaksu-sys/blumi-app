import type { LinkingOptions } from "@react-navigation/native"
import { Linking } from "react-native"
import { captureProductEvent } from "../analytics/productAnalytics"
import { parseReferralCodeFromUrl } from "../features/referrals/referralModel"
import { capturePendingReferral } from "../features/referrals/referralStorage"
import type { RootStackParamList } from "./RootNavigator"

/**
 * Deep links for the root stack. Referral links are captured for later
 * attribution and never reach navigation; every other `blumi://` link routes
 * through the path config below.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["blumi://"],
  config: {
    screens: {
      Lobby: "discover",
      Inbox: "inbox",
      ChatThread: "chat/:threadId",
      ProfilePreview: "profile/:userId",
      Settings: "settings",
      MyRoom: "room",
      MyRoomEditor: "room/edit",
      WardrobeV2: "wardrobe",
      CosmeticShop: "shop"
    }
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL()
    if (!url) return url
    const referralCode = parseReferralCodeFromUrl(url)
    if (!referralCode) return url
    await capturePendingReferral({ code: referralCode })
    captureProductEvent("referral_link_opened", { source: "initial_url" })
    return null
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const referralCode = parseReferralCodeFromUrl(url)
      if (referralCode) {
        void capturePendingReferral({ code: referralCode })
        captureProductEvent("referral_link_opened", { source: "app_link" })
        return
      }
      listener(url)
    })
    return () => subscription.remove()
  }
}
