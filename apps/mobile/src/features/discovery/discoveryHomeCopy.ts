import type { DiscoveryGender } from "@blumi/contracts"
import type { AppLocale } from "../session/appLocale"

interface GenderOptionCopy {
  readonly label: string
  readonly accessibilityLabel: string
}

// User-facing and VoiceOver text for the Discover header and filters sheet.
export interface DiscoveryHomeCopy {
  readonly header: {
    readonly title: string
    readonly filtersAccessibilityLabel: string
  }
  readonly filters: {
    readonly closeAccessibilityLabel: string
    readonly title: string
    readonly subtitle: string
    readonly showMe: string
    readonly everyone: string
    readonly showEveryoneAccessibilityLabel: string
    readonly genders: Readonly<Record<DiscoveryGender, GenderOptionCopy>>
    readonly ageRange: string
    readonly ageRangeAccessibilityLabel: (ageMin: number, ageMax: number) => string
    readonly minimumAge: string
    readonly maximumAge: string
    readonly reset: string
    readonly resetAccessibilityLabel: string
    readonly apply: string
  }
}

const COPY: Record<AppLocale, DiscoveryHomeCopy> = {
  tr: {
    header: {
      title: "Keşfet",
      filtersAccessibilityLabel: "Discover filtrelerini aç"
    },
    filters: {
      closeAccessibilityLabel: "Discover filtrelerini kapat",
      title: "Vibe'ını belirle",
      subtitle: "Discover'da kimleri göreceğini seç.",
      showMe: "Bana göster",
      everyone: "Herkes",
      showEveryoneAccessibilityLabel: "Herkesi göster",
      genders: {
        woman: { label: "Kadınlar", accessibilityLabel: "Kadınları göster" },
        man: { label: "Erkekler", accessibilityLabel: "Erkekleri göster" }
      },
      ageRange: "Yaş aralığı",
      ageRangeAccessibilityLabel: (ageMin, ageMax) => `Yaş aralığı, ${ageMin} ile ${ageMax} arası`,
      minimumAge: "En düşük yaş",
      maximumAge: "En yüksek yaş",
      reset: "Sıfırla",
      resetAccessibilityLabel: "Filtreleri sıfırla",
      apply: "Eşleşmeleri göster"
    }
  },
  en: {
    header: {
      title: "Discover",
      filtersAccessibilityLabel: "Open discover filters"
    },
    filters: {
      closeAccessibilityLabel: "Close discovery filters",
      title: "Set your vibe",
      subtitle: "Choose who shows up in Discover.",
      showMe: "Show me",
      everyone: "Everyone",
      showEveryoneAccessibilityLabel: "Show everyone",
      genders: {
        woman: { label: "Women", accessibilityLabel: "Show women" },
        man: { label: "Men", accessibilityLabel: "Show men" }
      },
      ageRange: "Age range",
      ageRangeAccessibilityLabel: (ageMin, ageMax) => `Age range, ${ageMin} to ${ageMax}`,
      minimumAge: "Minimum age",
      maximumAge: "Maximum age",
      reset: "Reset",
      resetAccessibilityLabel: "Reset filters",
      apply: "Show matches"
    }
  }
}

export function getDiscoveryHomeCopy(locale: AppLocale): DiscoveryHomeCopy {
  return COPY[locale]
}
