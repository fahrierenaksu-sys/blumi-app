import type { AppLocale } from "../session/appLocale"

export interface ShopCopy {
  back: string
  brand: string
  homeCollection: string
  liveCloset: string
  coins: string
  avatar: string
  home: string
  avatarShopAccessibility: string
  homeShopAccessibility: string
  loading: { title: string; body: string }
  offline: { title: string; body: string; actionUnavailable: string }
  empty: { title: string; body: string }
  error: { title: string; body: string }
  retry: string
  retryAccessibility: string
  saving: string
  unlock: string
  removePreview: string
  liveTryOn: string
  previewOnAvatar: string
  showcaseTitle: string
  roomPreview: string
  owned: string
  previewing: string
  avatarPreviewGuide: string
  roomPreviewGuide: string
  genericPreviewGuide: string
  avatarOwnedFootnote: string
  avatarUnlockFootnote: string
  roomOwnedFootnote: string
  roomUnlockFootnote: string
  genericFootnote: string
  findYourStyle: string
  roomPieces: string
  avatarCatalogHint: string
  roomCatalogHint: string
  previousPage: string
  nextPage: string
  shelfPage: (page: number, total: number) => string
  ownedCompact: string
  itemCount: (count: number) => string
  categories: Record<string, string>
  readyToPlace: string
  product: {
    wearing: string
    wearingOutfit: string
    ownedOutfit: string
    placed: (count: number) => string
    wearNow: string
    wearOutfit: string
    placeNow: string
    tryStyle: string
    avatarOutfit: string
    avatarAccessory: string
    avatarCategory: (category: string) => string
    roomCategory: (category: string) => string
  }
  combination: {
    buyLook: string
    lookTitle: (count: number) => string
    individualPurchase: string
    previousPieces: string
    nextPieces: string
    selectionSummary: (count: number, purchaseCount: number) => string
    applyLook: string
    itemUnavailable: string
    priceNeedsRefresh: string
    appliedTitle: string
    appliedBody: string
    alreadyApplied: string
    purchaseTitle: string
    cancel: string
    buy: string
    purchaseSummary: (title: string, price: string, remaining: string) => string
    purchaseFailure: (reason: string | undefined) => string
  }
}

const COPY: Record<AppLocale, ShopCopy> = {
  en: {
    back: "Go back",
    brand: "Blumi Store",
    homeCollection: "Home Collection.",
    liveCloset: "Style Boutique.",
    coins: "coins",
    avatar: "Avatar",
    home: "Home",
    avatarShopAccessibility: "Avatar shop",
    homeShopAccessibility: "Home shop",
    loading: { title: "Loading your store", body: "Getting your coins and collection ready." },
    offline: {
      title: "You’re offline",
      body: "You can browse saved items, but purchases and saved changes need a connection.",
      actionUnavailable: "Reconnect to unlock or save this item."
    },
    empty: { title: "Nothing here yet", body: "This collection is taking a short pause. Try again in a moment." },
    error: { title: "We couldn’t refresh your store", body: "Your collection is safe. Please try again." },
    retry: "Try again",
    retryAccessibility: "Retry loading store",
    saving: "Saving…",
    unlock: "Unlock",
    removePreview: "Remove preview",
    liveTryOn: "Live try-on",
    previewOnAvatar: "Preview on avatar",
    showcaseTitle: "Find your\nnext favorite.",
    roomPreview: "Room preview",
    owned: "Owned",
    previewing: "Previewing",
    avatarPreviewGuide: "Live on your avatar",
    roomPreviewGuide: "See it in your room",
    genericPreviewGuide: "See the vibe before you unlock it",
    avatarOwnedFootnote: "Applies to your saved avatar.",
    avatarUnlockFootnote: "Unlock it here, then wear it from Avatar Studio.",
    roomOwnedFootnote: "Opens Edit Room so you can place it.",
    roomUnlockFootnote: "Unlock it here, then place it from Edit Room.",
    genericFootnote: "A clean preview of the look.",
    findYourStyle: "Shop the collection",
    roomPieces: "Room pieces",
    avatarCatalogHint: "Swipe to explore styles",
    previousPage: "Previous items",
    nextPage: "Next items",
    shelfPage: (page, total) => `Page ${page} of ${total}`,
    ownedCompact: "Owned",
    roomCatalogHint: "Tap a piece to preview it in your room.",
    itemCount: (count) => `${count} items`,
    categories: {
      owned: "Owned", face: "Face", eyes: "Eyes", nose: "Nose", mouth: "Mouth",
      top: "Tops", bottom: "Bottoms", dress: "Dresses", outerwear: "Outerwear", shoes: "Shoes", hair: "Hair",
      accessory: "Accessories", all: "All", seating: "Seating", table: "Tables",
      lighting: "Lighting", rug: "Rugs", wallDecor: "Wall", plant: "Plants", misc: "Storage & decor"
    },
    readyToPlace: "Ready to place",
    product: {
      wearing: "Wearing", wearingOutfit: "Wearing outfit", ownedOutfit: "Owned outfit",
      placed: (count) => `${count} placed`, wearNow: "Wear now", wearOutfit: "Wear outfit",
      placeNow: "Place now", tryStyle: "Try style", avatarOutfit: "Avatar outfit",
      avatarAccessory: "Avatar accessory", avatarCategory: (category) => `Avatar ${category}`,
      roomCategory: (category) => `Room ${category}`
    },
    combination: {
      buyLook: "Buy the look",
      lookTitle: (count) => `Your look · ${count}`,
      individualPurchase: "Open selected item below",
      previousPieces: "Show previous pieces",
      nextPieces: "Show more pieces",
      selectionSummary: (count, purchaseCount) => `${count} selected · ${purchaseCount} to buy`,
      applyLook: "Apply look",
      itemUnavailable: "This item cannot be applied right now",
      priceNeedsRefresh: "This item price needs a refresh",
      appliedTitle: "Your look is applied",
      appliedBody: "Your avatar is updated across Blumi.",
      alreadyApplied: "This look is already on",
      purchaseTitle: "Buy this item",
      cancel: "Cancel",
      buy: "Buy",
      purchaseSummary: (title, price, remaining) => `${title}\n${price} coins · ${remaining} coins remaining`,
      purchaseFailure: (reason) => reason === "not_enough_coins"
        ? "Not enough coins"
        : reason === "invalid_item"
          ? "This item is not available"
          : reason === "invalid_price"
            ? "This item price needs a refresh"
            : "The purchase could not be completed"
    }
  },
  tr: {
    back: "Geri dön",
    brand: "Blumi Mağaza",
    homeCollection: "Ev Koleksiyonu.",
    liveCloset: "Stil Mağazası.",
    coins: "jeton",
    avatar: "Avatar",
    home: "Ev",
    avatarShopAccessibility: "Avatar mağazası",
    homeShopAccessibility: "Ev mağazası",
    loading: { title: "Mağazan hazırlanıyor", body: "Jetonların ve koleksiyonun yükleniyor." },
    offline: {
      title: "Çevrimdışısın",
      body: "Kayıtlı öğelere göz atabilirsin; satın alma ve kaydetme için bağlantı gerekir.",
      actionUnavailable: "Bu öğeyi açmak veya kaydetmek için yeniden bağlan."
    },
    empty: { title: "Henüz bir şey yok", body: "Bu koleksiyon kısa bir arada. Biraz sonra tekrar dene." },
    error: { title: "Mağazan yenilenemedi", body: "Koleksiyonun güvende. Lütfen tekrar dene." },
    retry: "Tekrar dene",
    retryAccessibility: "Mağaza yüklemesini yeniden dene",
    saving: "Kaydediliyor…",
    unlock: "Aç",
    removePreview: "Önizlemeyi kaldır",
    liveTryOn: "Canlı dene",
    previewOnAvatar: "Avatarında önizle",
    showcaseTitle: "Yeni favorini\nkeşfet.",
    roomPreview: "Oda önizlemesi",
    owned: "Sahip olundu",
    previewing: "Önizleniyor",
    avatarPreviewGuide: "Avatarında canlı gör",
    roomPreviewGuide: "Odanda gör",
    genericPreviewGuide: "Açmadan önce havayı gör",
    avatarOwnedFootnote: "Kayıtlı avatarına uygulanır.",
    avatarUnlockFootnote: "Buradan aç, sonra Avatar Stüdyosu’nda giy.",
    roomOwnedFootnote: "Yerleştirmek için Odayı Düzenle’yi açar.",
    roomUnlockFootnote: "Buradan aç, sonra Odayı Düzenle’den yerleştir.",
    genericFootnote: "Görünümün temiz bir önizlemesi.",
    findYourStyle: "Koleksiyonu keşfet",
    roomPieces: "Oda parçaları",
    avatarCatalogHint: "Kaydır, tarzını keşfet",
    previousPage: "Önceki ürünler",
    nextPage: "Sonraki ürünler",
    shelfPage: (page, total) => `Sayfa ${page} / ${total}`,
    ownedCompact: "Sende",
    roomCatalogHint: "Odanda önizlemek için bir parçaya dokun.",
    itemCount: (count) => `${count} öğe`,
    categories: {
      owned: "Sahip oldukların", face: "Yüz", eyes: "Gözler", nose: "Burun", mouth: "Ağız",
      top: "Üstler", bottom: "Altlar", dress: "Elbiseler", outerwear: "Dış giyim", shoes: "Ayakkabılar", hair: "Saç",
      accessory: "Aksesuarlar", all: "Tümü", seating: "Oturma", table: "Masalar",
      lighting: "Aydınlatma", rug: "Halılar", wallDecor: "Duvar", plant: "Bitkiler", misc: "Depolama ve dekor"
    },
    readyToPlace: "Yerleştirmeye hazır",
    product: {
      wearing: "Giyili", wearingOutfit: "Kombin giyili", ownedOutfit: "Kombin sende",
      placed: (count) => `${count} yerleştirildi`, wearNow: "Şimdi giy", wearOutfit: "Kombini giy",
      placeNow: "Şimdi yerleştir", tryStyle: "Tarzı dene", avatarOutfit: "Avatar kombini",
      avatarAccessory: "Avatar aksesuarı", avatarCategory: (category) => `Avatar ${category}`,
      roomCategory: (category) => `Oda ${category}`
    },
    combination: {
      buyLook: "Kombini al",
      lookTitle: (count) => `Kombinin · ${count} parça`,
      individualPurchase: "Aşağıdan seçili parçayı aç",
      previousPieces: "Önceki parçaları göster",
      nextPieces: "Diğer parçaları göster",
      selectionSummary: (count, purchaseCount) => `${count} parça · ${purchaseCount} yeni`,
      applyLook: "Kombini uygula",
      itemUnavailable: "Bu ürün şu anda uygulanamıyor",
      priceNeedsRefresh: "Ürün fiyatı yenilenmeli",
      appliedTitle: "Kombinin uygulandı",
      appliedBody: "Avatarın Blumi genelinde güncellendi.",
      alreadyApplied: "Kombin zaten üzerinde",
      purchaseTitle: "Ürünü satın al",
      cancel: "Vazgeç",
      buy: "Satın al",
      purchaseSummary: (title, price, remaining) => `${title}\n${price} jeton · Kalan ${remaining} jeton`,
      purchaseFailure: (reason) => reason === "not_enough_coins"
        ? "Yeterli jetonun yok"
        : reason === "invalid_item"
          ? "Bu ürün şu anda kullanılamıyor"
          : reason === "invalid_price"
            ? "Ürün fiyatı yenilenmeli"
            : "Satın alma tamamlanamadı"
    }
  }
}

export function getShopCopy(locale: AppLocale): ShopCopy {
  return COPY[locale]
}
