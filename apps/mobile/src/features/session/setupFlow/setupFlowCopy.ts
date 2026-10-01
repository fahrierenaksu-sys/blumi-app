import type { PreAuthSetupStep } from "../onboardingFlowModel"

/** The setup flow speaks the app language: Turkish or English (ONB-14). */
export type SetupFlowLocale = "tr" | "en"

export interface SetupFlowStepCopy {
  title: string
  description: string
  primaryAction: string
}

export type AvatarStudioCategoryKey = "hair" | "top" | "bottom" | "shoes"

export interface SetupFlowCopy {
  steps: Readonly<Record<PreAuthSetupStep, SetupFlowStepCopy>>
  back: string
  stepProgress: (current: number, total: number) => string
  signOut: {
    title: string
    body: string
    keepGoing: string
    confirm: string
  }
  avatar: {
    headerTitle: string
    title: string
    description: string
    freedomAccessibilityLabel: string
    changeAnyTime: string
    discoverInShop: string
    categories: Readonly<Record<AvatarStudioCategoryKey, string>>
  }
  studio: {
    accessibilityLabel: string
    woman: string
    man: string
    chooseCategoryHint: (category: string) => string
    cycleLabel: (category: string, previous: boolean) => string
  }
  room: {
    continueAction: string
  }
  welcomeHomeAccessibilityLabel: string
}

const TR: SetupFlowCopy = {
  steps: {
    profile: {
      title: "Seni nasıl tanıyalım?",
      description: "İlk olarak sana nasıl sesleneceğimizi seçelim.",
      primaryAction: "Karakterimi hazırlayalım"
    },
    avatar: {
      title: "Karakterini hazırla",
      description: "Seni yansıtan ilk görünümü birlikte seçelim.",
      primaryAction: "Karakterim hazır"
    },
    room: {
      title: "İlk köşeni birlikte kuralım",
      description: "Yatağını yerleştir; sonra istediğin zaman değiştirebilirsin.",
      primaryAction: "Odam hazır"
    },
    phone: {
      title: "Dünyan kaybolmasın",
      description: "Telefonunla Blumi dünyanı güvende tut.",
      primaryAction: "Kod gönder"
    },
    otp: {
      title: "Mesajlarına bak",
      description: "Gönderdiğimiz 6 haneli kodu gir.",
      primaryAction: "Blumi’ye katıl"
    }
  },
  back: "Geri",
  stepProgress: (current, total) => `Kurulum adımı ${current} / ${total}`,
  signOut: {
    title: "Blumi’den çıkış yapılsın mı?",
    body: "Kaydettiğin kurulum ilerlemesi güvende kalır. Tekrar giriş yaptığında devam edebilirsin.",
    keepGoing: "Kuruluma devam et",
    confirm: "Çıkış yap"
  },
  avatar: {
    headerTitle: "İlk görünümün",
    title: "Karakterini hazırla",
    description: "Bu sadece başlangıç. Tarzını sonra da değiştirebilirsin.",
    freedomAccessibilityLabel:
      "Görünümünü istediğin zaman değiştirebilir ve Mağaza’dan yeni parçalar keşfedebilirsin.",
    changeAnyTime: "İstediğin zaman değiştir",
    discoverInShop: "Mağaza’da yeni parçalar keşfet",
    categories: { hair: "Saç", top: "Üst", bottom: "Alt", shoes: "Ayakkabı" }
  },
  studio: {
    accessibilityLabel: "Karakter görünüm stüdyosu",
    woman: "Kadın",
    man: "Erkek",
    chooseCategoryHint: (category) => `${category} görünümünü seç`,
    cycleLabel: (category, previous) => `${category} için ${previous ? "önceki" : "sonraki"} görünüm`
  },
  room: {
    continueAction: "Devam et"
  },
  welcomeHomeAccessibilityLabel: "Sıcak Blumi evinin önünde canlı karakterler"
}

const EN: SetupFlowCopy = {
  steps: {
    profile: {
      title: "How should we know you?",
      description: "First, let’s choose how we’ll greet you.",
      primaryAction: "Let’s make my character"
    },
    avatar: {
      title: "Make your character",
      description: "Let’s pick a first look that feels like you.",
      primaryAction: "My character is ready"
    },
    room: {
      title: "Let’s set up your first corner",
      description: "Place your bed; you can change it any time.",
      primaryAction: "My room is ready"
    },
    phone: {
      title: "Keep your world safe",
      description: "Keep your Blumi world safe with your phone.",
      primaryAction: "Send code"
    },
    otp: {
      title: "Check your messages",
      description: "Enter the 6-digit code we sent you.",
      primaryAction: "Join Blumi"
    }
  },
  back: "Back",
  stepProgress: (current, total) => `Setup step ${current} of ${total}`,
  signOut: {
    title: "Sign out of Blumi?",
    body: "Your saved setup progress stays safe. You can continue after signing in again.",
    keepGoing: "Keep setting up",
    confirm: "Sign out"
  },
  avatar: {
    headerTitle: "Your first look",
    title: "Make your character",
    description: "This is just the start. You can change your style later.",
    freedomAccessibilityLabel:
      "You can change your look any time and discover new pieces in the Shop.",
    changeAnyTime: "Change it any time",
    discoverInShop: "Discover new pieces in the Shop",
    categories: { hair: "Hair", top: "Top", bottom: "Bottom", shoes: "Shoes" }
  },
  studio: {
    accessibilityLabel: "Character look studio",
    woman: "Woman",
    man: "Man",
    chooseCategoryHint: (category) => `Choose the ${category.toLowerCase()} look`,
    cycleLabel: (category, previous) => `${previous ? "Previous" : "Next"} ${category.toLowerCase()} look`
  },
  room: {
    continueAction: "Continue"
  },
  welcomeHomeAccessibilityLabel: "Lively characters in front of a warm Blumi home"
}

export function getSetupFlowCopy(locale: SetupFlowLocale): SetupFlowCopy {
  return locale === "tr" ? TR : EN
}
