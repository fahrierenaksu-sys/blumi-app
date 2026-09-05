import type { AppLocale } from "../session/appLocale"

export interface DiscoverySurfaceCopy {
  readonly actions: {
    readonly pass: string
    readonly like: string
    readonly passAccessibilityLabel: string
    readonly likeAccessibilityLabel: string
  }
  readonly card: {
    readonly showProfile: string
    readonly flipProfile: string
    readonly likeStamp: string
    readonly passStamp: string
    readonly privateLocation: string
    readonly veryClose: string
    readonly nearby: string
    readonly overline: string
    readonly continuationHint: string
    readonly detailLabel: string
    readonly detailFallback: string
    readonly commonGroundLabel: string
    readonly highlightsLabel: string
    readonly roomShowcaseLabel: string
    readonly returnHint: string
  }
  readonly empty: {
    readonly lowSupplyTitle: string
    readonly lowSupplyBody: string
    readonly exhaustedTitle: string
    readonly exhaustedBody: string
    readonly refreshAccessibilityLabel: string
    readonly refreshAction: string
    readonly refreshingAction: string
    readonly loadingTitle: string
    readonly loadingBody: string
    readonly errorTitle: string
    readonly errorAction: string
    readonly errorAccessibilityLabel: string
    readonly watchActivate: string
    readonly watchActive: string
    readonly watchActiveBody: string
    readonly watchInactiveBody: string
    readonly watchCancel: string
    readonly quotaTitle: string
    readonly quotaFallbackUsage: string
    readonly quotaReset: string
    readonly rewardTitle: string
    readonly rewardBody: string
    readonly quotaUsage: (used: number, limit: number) => string
  }
}

const COPY: Record<AppLocale, DiscoverySurfaceCopy> = {
  tr: {
    actions: {
      pass: "Geç",
      like: "Beğen",
      passAccessibilityLabel: "Profili geç",
      likeAccessibilityLabel: "Profili beğen"
    },
    card: {
      showProfile: "Profili göster",
      flipProfile: "Profil kartını çevir",
      likeStamp: "BEĞEN",
      passStamp: "GEÇ",
      privateLocation: "Konum gizli",
      veryClose: "Çok yakın",
      nearby: "Yakında",
      overline: "VIBE KARTI",
      continuationHint: "Bu kartın küçük bir devamı.",
      detailLabel: "KÜÇÜK BİR DETAY",
      detailFallback: "Bu profil hakkında daha fazlası yakında.",
      commonGroundLabel: "ORTAK NOKTALAR",
      highlightsLabel: "ÖNE ÇIKANLAR",
      roomShowcaseLabel: "ODA VİTRİNİ",
      returnHint: "Tekrar dokun, ön yüze dön"
    },
    empty: {
      lowSupplyTitle: "Şu anda tanışabileceğin yeni biri yok.",
      lowSupplyBody: "Daha sonra tekrar kontrol et; sana uygun birini aramaya devam edeceğiz.",
      exhaustedTitle: "Şimdilik herkesi gördün.",
      exhaustedBody: "Şimdilik herkesi gördün. Biraz sonra tekrar uğra.",
      refreshAccessibilityLabel: "Discover profillerini yenile",
      refreshAction: "Tekrar kontrol et",
      refreshingAction: "Kontrol ediliyor…",
      loadingTitle: "Sana uygun kişiler aranıyor…",
      loadingBody: "Bu genellikle kısa sürer.",
      errorTitle: "Discover'ın biraz zamana ihtiyacı var.",
      errorAction: "Tekrar dene",
      errorAccessibilityLabel: "Discover'ı tekrar dene",
      watchActivate: "Benim için aramaya devam et",
      watchActive: "Blumi senin için arıyor",
      watchActiveBody: "Mevcut filtrelerin 7 gün boyunca saklanır.",
      watchInactiveBody: "7 gün saklanır; uygun yeni biri geldiğinde sana haber veririz.",
      watchCancel: "Vibe Kartı'nı iptal et",
      quotaTitle: "Bugünkü Discover limitine ulaştın.",
      quotaFallbackUsage: "Bugünkü Discover limitine ulaştın.",
      quotaReset: "Yeni 10 kararın 00:00 UTC'de yenilenir.",
      rewardTitle: "Ödüllü reklamlar kullanılamıyor",
      rewardBody: "Doğrulanmış ödüller henüz hazır değil.",
      quotaUsage: (used, limit) => `Bugün ${used}/${limit} karar kullandın.`
    }
  },
  en: {
    actions: {
      pass: "Pass",
      like: "Like",
      passAccessibilityLabel: "Pass on profile",
      likeAccessibilityLabel: "Like profile"
    },
    card: {
      showProfile: "Show profile",
      flipProfile: "Flip profile card",
      likeStamp: "LIKE",
      passStamp: "PASS",
      privateLocation: "Location private",
      veryClose: "Very close",
      nearby: "Nearby",
      overline: "VIBE CARD",
      continuationHint: "A little more from this profile.",
      detailLabel: "A SMALL DETAIL",
      detailFallback: "There will be more to discover about this profile soon.",
      commonGroundLabel: "COMMON GROUND",
      highlightsLabel: "HIGHLIGHTS",
      roomShowcaseLabel: "ROOM SHOWCASE",
      returnHint: "Tap again to return to the front"
    },
    empty: {
      lowSupplyTitle: "No new people to meet right now.",
      lowSupplyBody: "Check again later and we'll keep looking for a good fit.",
      exhaustedTitle: "That's everyone for now.",
      exhaustedBody: "You've seen everyone for now. Check back in a little while.",
      refreshAccessibilityLabel: "Refresh Discover profiles",
      refreshAction: "Check again",
      refreshingAction: "Checking…",
      loadingTitle: "Finding people who match your vibe…",
      loadingBody: "This usually takes a moment.",
      errorTitle: "Discover needs a moment.",
      errorAction: "Try again",
      errorAccessibilityLabel: "Retry Discover",
      watchActivate: "Keep looking for me",
      watchActive: "Blumi is keeping watch",
      watchActiveBody: "Your current filters are saved for 7 days.",
      watchInactiveBody: "Saved for 7 days; we'll let you know when someone new fits.",
      watchCancel: "Cancel Vibe Card",
      quotaTitle: "That's your Discover limit for today.",
      quotaFallbackUsage: "Today's Discover limit is reached.",
      quotaReset: "Your next 10 decisions reset at 00:00 UTC.",
      rewardTitle: "Rewarded ads unavailable",
      rewardBody: "Verified rewards aren't set up yet.",
      quotaUsage: (used, limit) => `${used}/${limit} decisions used today.`
    }
  }
}

export function getDiscoverySurfaceCopy(locale: AppLocale): DiscoverySurfaceCopy {
  return COPY[locale]
}
