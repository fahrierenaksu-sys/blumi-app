import type { DiscoveryGender } from "@blumi/contracts"
import type { AppLocale } from "../session/appLocale"

// Canonical vibe filter values. The server matches these by value, so they
// never change with the locale; only their labels do.
export const DISCOVERY_VIBE_OPTIONS = [
  "Coffee dates",
  "Slow burn",
  "Bookish",
  "Outdoors",
  "Creative",
  "Fitness",
  "Night owl",
  "Pets"
] as const

export type DiscoveryVibeOption = (typeof DISCOVERY_VIBE_OPTIONS)[number]

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
    readonly eyebrow: string
    readonly title: string
    readonly showMe: string
    readonly everyone: string
    readonly showEveryoneAccessibilityLabel: string
    readonly genders: Readonly<Record<DiscoveryGender, GenderOptionCopy>>
    readonly ageWindow: string
    readonly minimum: string
    readonly maximum: string
    readonly decreaseMinimumAge: (age: number) => string
    readonly increaseMinimumAge: (age: number) => string
    readonly decreaseMaximumAge: (age: number) => string
    readonly increaseMaximumAge: (age: number) => string
    readonly vibesTitle: string
    readonly vibeLabels: Readonly<Record<DiscoveryVibeOption, string>>
    readonly vibeAccessibilityLabel: (label: string) => string
    readonly reset: string
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
      eyebrow: "DISCOVER",
      title: "Vibe'ını belirle",
      showMe: "Bana göster",
      everyone: "Herkes",
      showEveryoneAccessibilityLabel: "Herkesi göster",
      genders: {
        woman: { label: "Kadınlar", accessibilityLabel: "Kadınları göster" },
        man: { label: "Erkekler", accessibilityLabel: "Erkekleri göster" }
      },
      ageWindow: "Yaş aralığı",
      minimum: "Min",
      maximum: "Maks",
      decreaseMinimumAge: (age) => `En düşük yaşı azalt, şu an ${age}`,
      increaseMinimumAge: (age) => `En düşük yaşı artır, şu an ${age}`,
      decreaseMaximumAge: (age) => `En yüksek yaşı azalt, şu an ${age}`,
      increaseMaximumAge: (age) => `En yüksek yaşı artır, şu an ${age}`,
      vibesTitle: "Sevdiğin vibe'lar",
      vibeLabels: {
        "Coffee dates": "Kahve buluşmaları",
        "Slow burn": "Yavaş yavaş",
        Bookish: "Kitap kurdu",
        Outdoors: "Doğa",
        Creative: "Yaratıcı",
        Fitness: "Spor",
        "Night owl": "Gece kuşu",
        Pets: "Evcil hayvanlar"
      },
      vibeAccessibilityLabel: (label) => `${label} vibe'ı`,
      reset: "Sıfırla",
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
      eyebrow: "DISCOVERY",
      title: "Set your vibe",
      showMe: "Show me",
      everyone: "Everyone",
      showEveryoneAccessibilityLabel: "Show everyone",
      genders: {
        woman: { label: "Women", accessibilityLabel: "Show women" },
        man: { label: "Men", accessibilityLabel: "Show men" }
      },
      ageWindow: "Age window",
      minimum: "Min",
      maximum: "Max",
      decreaseMinimumAge: (age) => `Decrease minimum age, currently ${age}`,
      increaseMinimumAge: (age) => `Increase minimum age, currently ${age}`,
      decreaseMaximumAge: (age) => `Decrease maximum age, currently ${age}`,
      increaseMaximumAge: (age) => `Increase maximum age, currently ${age}`,
      vibesTitle: "Vibes you like",
      vibeLabels: {
        "Coffee dates": "Coffee dates",
        "Slow burn": "Slow burn",
        Bookish: "Bookish",
        Outdoors: "Outdoors",
        Creative: "Creative",
        Fitness: "Fitness",
        "Night owl": "Night owl",
        Pets: "Pets"
      },
      vibeAccessibilityLabel: (label) => `${label} vibe`,
      reset: "Reset",
      apply: "Show matches"
    }
  }
}

export function getDiscoveryHomeCopy(locale: AppLocale): DiscoveryHomeCopy {
  return COPY[locale]
}
