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
  /** Card X: takes the item off the avatar (`title` is the product name). */
  removeFromAvatar: (title: string) => string
  removedFromAvatar: (title: string) => string
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
    /** The outfit row's X and swipe action. */
    removeFromOutfit: string
    selectionSummary: (count: number, purchaseCount: number) => string
    applyLook: string
    itemUnavailable: string
    priceNeedsRefresh: string
    appliedTitle: string
    appliedBody: string
    alreadyApplied: string
    cancel: string
    purchaseFailure: (reason: string | undefined) => string
  }
  checkout: {
    title: string
    itemCount: (count: number) => string
    total: string
    balance: string
    balanceAfter: string
    shortfall: (coins: string) => string
    priceUnknown: string
    confirm: (total: string) => string
    confirmAccessibility: (total: string) => string
    buying: string
    applying: string
    applied: string
    partial: (purchased: number, total: number) => string
    noneCharged: string
    applyFailed: string
    cancel: string
    close: string
    done: string
    retry: string
    closeAccessibility: string
    lineStatus: {
      pending: string
      purchasing: string
      purchased: string
      notCharged: string
    }
    lineAccessibility: (title: string, price: string, status: string) => string
    unknownItem: string
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
    removeFromAvatar: (title) => `Take ${title} off your avatar`,
    removedFromAvatar: (title) => `${title} taken off`,
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
      removeFromOutfit: "Remove from outfit",
      selectionSummary: (count, purchaseCount) => `${count} selected · ${purchaseCount} to buy`,
      applyLook: "Apply look",
      itemUnavailable: "This item cannot be applied right now",
      priceNeedsRefresh: "This item price needs a refresh",
      appliedTitle: "Your look is applied",
      appliedBody: "Your avatar is updated across Blumi.",
      alreadyApplied: "This look is already on",
      cancel: "Cancel",
      purchaseFailure: (reason) => reason === "not_enough_coins"
        ? "Not enough coins"
        : reason === "invalid_item"
          ? "This item is not available"
          : reason === "invalid_price"
            ? "This item price needs a refresh"
            : "The purchase could not be completed"
    },
    checkout: {
      title: "Buy the look",
      itemCount: (count) => (count === 1 ? "1 piece" : `${count} pieces`),
      total: "Total",
      balance: "Your coins",
      balanceAfter: "After purchase",
      shortfall: (coins) => `You need ${coins} more coins`,
      priceUnknown: "A price needs a refresh. Try again in a moment.",
      confirm: (total) => `Buy · ${total}`,
      confirmAccessibility: (total) => `Buy the look for ${total} coins`,
      buying: "Buying…",
      applying: "Putting on your look…",
      applied: "Your look is applied",
      partial: (purchased, total) => `${purchased} of ${total} pieces are yours. Nothing else was charged.`,
      noneCharged: "Nothing was charged.",
      applyFailed: "Your new pieces are yours, but the look could not be put on yet. Try again.",
      cancel: "Cancel",
      close: "Close",
      done: "Done",
      retry: "Try again",
      closeAccessibility: "Close checkout",
      lineStatus: {
        pending: "Ready to buy",
        purchasing: "Buying",
        purchased: "Yours",
        notCharged: "Not charged"
      },
      lineAccessibility: (title, price, status) => `${title}, ${price} coins, ${status}`,
      unknownItem: "Unavailable piece"
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
    removeFromAvatar: (title) => `${title}: avatardan çıkar`,
    removedFromAvatar: (title) => `${title} çıkarıldı`,
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
      removeFromOutfit: "Kombinden çıkar",
      selectionSummary: (count, purchaseCount) => `${count} parça · ${purchaseCount} yeni`,
      applyLook: "Kombini uygula",
      itemUnavailable: "Bu ürün şu anda uygulanamıyor",
      priceNeedsRefresh: "Ürün fiyatı yenilenmeli",
      appliedTitle: "Kombinin uygulandı",
      appliedBody: "Avatarın Blumi genelinde güncellendi.",
      alreadyApplied: "Kombin zaten üzerinde",
      cancel: "Vazgeç",
      purchaseFailure: (reason) => reason === "not_enough_coins"
        ? "Yeterli jetonun yok"
        : reason === "invalid_item"
          ? "Bu ürün şu anda kullanılamıyor"
          : reason === "invalid_price"
            ? "Ürün fiyatı yenilenmeli"
            : "Satın alma tamamlanamadı"
    },
    checkout: {
      title: "Kombini al",
      itemCount: (count) => `${count} parça`,
      total: "Toplam",
      balance: "Jetonun",
      balanceAfter: "Satın alma sonrası",
      shortfall: (coins) => `${coins} jeton daha gerekiyor`,
      priceUnknown: "Bir fiyatın yenilenmesi gerekiyor. Birazdan tekrar dene.",
      confirm: (total) => `Satın al · ${total}`,
      confirmAccessibility: (total) => `Kombini ${total} jetona satın al`,
      buying: "Satın alınıyor…",
      applying: "Kombinin giydiriliyor…",
      applied: "Kombinin uygulandı",
      partial: (purchased, total) => `${total} parçadan ${purchased} tanesi artık senin. Diğerleri için ücret alınmadı.`,
      noneCharged: "Hiç ücret alınmadı.",
      applyFailed: "Yeni parçaların artık senin ama kombin henüz giydirilemedi. Tekrar dene.",
      cancel: "Vazgeç",
      close: "Kapat",
      done: "Tamam",
      retry: "Tekrar dene",
      closeAccessibility: "Ödemeyi kapat",
      lineStatus: {
        pending: "Alınmaya hazır",
        purchasing: "Alınıyor",
        purchased: "Senin",
        notCharged: "Ücret alınmadı"
      },
      lineAccessibility: (title, price, status) => `${title}, ${price} jeton, ${status}`,
      unknownItem: "Kullanılamayan parça"
    }
  }
}

export function getShopCopy(locale: AppLocale): ShopCopy {
  return COPY[locale]
}
