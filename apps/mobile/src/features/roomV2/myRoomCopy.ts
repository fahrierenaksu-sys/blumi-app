import type { AppLocale } from "../session/appLocale"

export interface MyRoomCopy {
  title: string
  subtitle: string
  profileOptions: string
  cozyRoom: string
  wardrobe: string
  wardrobeShort: string
  openWardrobe: string
  edit: string
  editRoom: string
  showcaseShort: string
  showcase: string
  showcasePublicShort: string
  share: string
  shareRoom: string
  inviteRequiredTitle: string
  inviteRequiredBody: string
  inviteTitle: string
  inviteUnavailableTitle: string
  tryAgain: string
  makeRoom: string
  chooseOpenFloor: string
  settledIn: string
  alreadyHere: string
  nearbyTile: string
  motionReady: string
  motionPreview: string
  motionNeedsPolish: string
}

const COPY: Record<AppLocale, MyRoomCopy> = {
  en: {
    title: "My Room",
    subtitle: "Move around your little world",
    profileOptions: "Open profile options",
    cozyRoom: "Cozy room",
    wardrobe: "Avatar Studio",
    wardrobeShort: "Avatar",
    openWardrobe: "Open Avatar Studio",
    edit: "Edit",
    editRoom: "Edit room",
    showcaseShort: "Card",
    showcase: "Room showcase",
    showcasePublicShort: "Public",
    share: "Share",
    shareRoom: "Share room",
    inviteRequiredTitle: "Invite links need a signed-in account",
    inviteRequiredBody: "Create a Blumi account to share an attributed invite.",
    inviteTitle: "A small invitation to Blumi",
    inviteUnavailableTitle: "Invite link unavailable",
    tryAgain: "Please try again in a moment.",
    makeRoom: "Make a little room first",
    chooseOpenFloor: "Choose an open floor spot",
    settledIn: "Settled in",
    alreadyHere: "Already here",
    nearbyTile: "Pick a nearby open tile",
    motionReady: "Ready",
    motionPreview: "Preview",
    motionNeedsPolish: "Needs polish"
  },
  tr: {
    title: "Odam",
    subtitle: "Küçük dünyanda dolaş",
    profileOptions: "Profil seçeneklerini aç",
    cozyRoom: "Sıcak oda",
    wardrobe: "Avatar Stüdyosu",
    wardrobeShort: "Avatar",
    openWardrobe: "Avatar Stüdyosu’nu aç",
    edit: "Düzenle",
    editRoom: "Odayı düzenle",
    showcaseShort: "Kart",
    showcase: "Oda vitrini",
    showcasePublicShort: "Açık",
    share: "Paylaş",
    shareRoom: "Odayı paylaş",
    inviteRequiredTitle: "Davet bağlantıları için oturum açmış bir hesap gerekir",
    inviteRequiredBody: "İsimli bir davet paylaşmak için Blumi hesabı oluştur.",
    inviteTitle: "Blumi’ye küçük bir davet",
    inviteUnavailableTitle: "Davet bağlantısı kullanılamıyor",
    tryAgain: "Lütfen biraz sonra tekrar dene.",
    makeRoom: "Önce biraz yer aç",
    chooseOpenFloor: "Açık bir zemin noktası seç",
    settledIn: "Yerleştin",
    alreadyHere: "Zaten buradasın",
    nearbyTile: "Yakındaki açık bir kareyi seç",
    motionReady: "Hazır",
    motionPreview: "Önizleme",
    motionNeedsPolish: "İyileştirme gerekiyor"
  }
}

export function getMyRoomCopy(locale: AppLocale): MyRoomCopy {
  return COPY[locale]
}

export interface MyRoomEditorCopy {
  title: string
  cancel: string
  undo: string
  confirmPlacement: string
  removeSelected: string
  rotateSelected: string
  saveLayout: string
  save: string
  saving: string
  retrySync: string
  roomStyle: string
  collectionTitle: string
  resetLayout: string
  searchLabel: string
  searchHint: string
  searchPlaceholder: string
  clearSearch: string
  nowEditing: string
  placed: string
  placeInRoom: string
  noMatches: string
  noPieces: string
  browseShop: string
  preparing: string
  stageLabel: string
  stageHint: string
  defaultSubtitle: string
  rotatableSubtitle: string
  fixedSubtitle: string
  defaultInspectorHint: string
  seatInspectorHint: string
  categoryLabels: Record<"all" | "seating" | "table" | "rug" | "misc" | "lighting" | "wallDecor" | "plant", string>
  rotationLabels: Record<"front" | "right" | "back" | "left", string>
  piecesReady: (count: number) => string
  chooseShell: (name: string) => string
  showCategory: (label: string) => string
  previewItem: (name: string) => string
  chooseRotation: (rotation: string, name: string) => string
  placeItem: (name: string) => string
  feedback: {
    chooseCompatibleSurface: string
    tapCheckToPlace: string
    releaseToPlace: string
    alreadyPlaced: string
    unsupportedDirection: string
    unavailableRotation: string
    chooseClearSpot: string
    roomStillLoading: string
    moveHighlighted: string
    missingCatalogItem: string
    invalidCurrentRotation: string
    clearAvatarPath: string
    saveBeforeReset: string
    overlapsFurniture: string
    outsideFloor: string
    invalidSurface: string
    missingSupport: string
    blocksAvatarPath: string
    tightButUsable: string
  }
  surfaceDrop: {
    floor: string
    wall: string
    ceiling: string
    tabletop: string
  }
  unsavedDialog: {
    title: string
    body: string
    stay: string
    discard: string
  }
  readiness: {
    ready: string
    constrained: string
    blocked: string
  }
}

const EDITOR_COPY: Record<AppLocale, MyRoomEditorCopy> = {
  en: {
    title: "Edit your room",
    cancel: "Cancel room editing",
    undo: "Undo last room change",
    confirmPlacement: "Confirm room placement",
    removeSelected: "Remove selected room item",
    rotateSelected: "Rotate selected room item",
    saveLayout: "Save room layout",
    save: "Save",
    saving: "Saving…",
    retrySync: "Retry room sync",
    roomStyle: "Room style",
    collectionTitle: "Your collection",
    resetLayout: "Reset layout",
    searchLabel: "Search room pieces",
    searchHint: "Filters room pieces by name",
    searchPlaceholder: "Search pieces",
    clearSearch: "Clear room piece search",
    nowEditing: "Now editing",
    placed: "Placed",
    placeInRoom: "Place in room",
    noMatches: "No pieces match this filter.",
    noPieces: "No room pieces yet.",
    browseShop: "Browse Shop",
    preparing: "Preparing your room…",
    stageLabel: "Room placement surface",
    stageHint: "Tap a clear place to move the selected item",
    defaultSubtitle: "Choose a piece, then place it your way",
    rotatableSubtitle: "Drag to move · rotate or save",
    fixedSubtitle: "Drag to move · then save",
    defaultInspectorHint: "Drag in the room · choose a direction",
    seatInspectorHint: "Turn front to sit · drag to move",
    categoryLabels: { all: "All", seating: "Seating", table: "Tables", rug: "Rugs", misc: "Media", lighting: "Lighting", wallDecor: "Walls", plant: "Decor" },
    rotationLabels: { front: "Front", right: "Right", back: "Back", left: "Left" },
    piecesReady: (count) => `${count} pieces ready to place`,
    chooseShell: (name) => `Choose ${name}`,
    showCategory: (label) => `Show ${label} room pieces`,
    previewItem: (name) => `${name} preview`,
    chooseRotation: (rotation, name) => `Choose ${rotation} view for ${name}`,
    placeItem: (name) => `Place ${name} in room`,
    feedback: {
      chooseCompatibleSurface: "Choose a compatible surface.",
      tapCheckToPlace: "Tap the check to place it here.",
      releaseToPlace: "Release to place.",
      alreadyPlaced: "You already placed this room piece.",
      unsupportedDirection: "This item does not support that direction.",
      unavailableRotation: "This item cannot be rendered in that rotation.",
      chooseClearSpot: "Choose a clear room spot.",
      roomStillLoading: "Your room is still loading.",
      moveHighlighted: "Move the highlighted item before saving.",
      missingCatalogItem: "This item is no longer available in the room catalog.",
      invalidCurrentRotation: "This item cannot be rendered in its current rotation.",
      clearAvatarPath: "Leave a clear path for your avatar before saving.",
      saveBeforeReset: "Save your room to Blumi before resetting it.",
      overlapsFurniture: "Another piece is in the way.",
      outsideFloor: "Keep it on the room floor.",
      invalidSurface: "Keep this item on its compatible wall or ceiling surface.",
      missingSupport: "Place this item on a desk, table, or other matching surface.",
      blocksAvatarPath: "This blocks your avatar path.",
      tightButUsable: "Tight but usable."
    },
    surfaceDrop: {
      floor: "Drag it onto the room floor.",
      wall: "Drag it onto the wall.",
      ceiling: "Drag it onto the ceiling area.",
      tabletop: "Drag it onto a desk or table surface."
    },
    unsavedDialog: {
      title: "Save room changes?",
      body: "You have changes that are not saved yet.",
      stay: "Stay in editor",
      discard: "Discard changes"
    },
    readiness: {
      ready: "Clear avatar path",
      constrained: "Tight but usable",
      blocked: "Needs more space"
    }
  },
  tr: {
    title: "Odanı düzenle",
    cancel: "Oda düzenlemeyi kapat",
    undo: "Son oda değişikliğini geri al",
    confirmPlacement: "Yerleşimi onayla",
    removeSelected: "Seçili eşyayı kaldır",
    rotateSelected: "Seçili eşyayı döndür",
    saveLayout: "Oda düzenini kaydet",
    save: "Kaydet",
    saving: "Kaydediliyor…",
    retrySync: "Odayı yeniden eşitle",
    roomStyle: "Oda stili",
    collectionTitle: "Koleksiyonun",
    resetLayout: "Düzeni sıfırla",
    searchLabel: "Oda eşyalarında ara",
    searchHint: "Eşyaları adına göre filtreler",
    searchPlaceholder: "Eşya ara",
    clearSearch: "Eşya aramasını temizle",
    nowEditing: "Şimdi düzenleniyor",
    placed: "Odada",
    placeInRoom: "Odaya yerleştir",
    noMatches: "Bu filtreye uygun eşya yok.",
    noPieces: "Henüz oda eşyan yok.",
    browseShop: "Mağazaya göz at",
    preparing: "Odan hazırlanıyor…",
    stageLabel: "Oda yerleşim alanı",
    stageHint: "Seçili eşyayı taşımak için açık bir noktaya dokun",
    defaultSubtitle: "Bir eşya seç ve odana yerleştir",
    rotatableSubtitle: "Taşımak için sürükle · döndür veya kaydet",
    fixedSubtitle: "Taşımak için sürükle · sonra kaydet",
    defaultInspectorHint: "Odaya sürükle · yönünü seç",
    seatInspectorHint: "Oturmak için öne çevir · taşımak için sürükle",
    categoryLabels: { all: "Tümü", seating: "Koltuklar", table: "Masalar", rug: "Halılar", misc: "Medya", lighting: "Aydınlatma", wallDecor: "Duvar", plant: "Dekor" },
    rotationLabels: { front: "Ön", right: "Sağ", back: "Arka", left: "Sol" },
    piecesReady: (count) => `Yerleştirmeye hazır ${count} eşya`,
    chooseShell: (name) => `${name} odasını seç`,
    showCategory: (label) => `${label} eşyalarını göster`,
    previewItem: (name) => `${name} önizlemesi`,
    chooseRotation: (rotation, name) => `${name} için ${rotation} yönünü seç`,
    placeItem: (name) => `${name} eşyasını odaya yerleştir`,
    feedback: {
      chooseCompatibleSurface: "Uygun bir yüzey seç.",
      tapCheckToPlace: "Buraya yerleştirmek için onaya dokun.",
      releaseToPlace: "Yerleştirmek için bırak.",
      alreadyPlaced: "Bu eşya zaten odanda.",
      unsupportedDirection: "Bu eşya o yönü desteklemiyor.",
      unavailableRotation: "Bu eşya o yönde gösterilemiyor.",
      chooseClearSpot: "Odada açık bir nokta seç.",
      roomStillLoading: "Odan hâlâ hazırlanıyor.",
      moveHighlighted: "Kaydetmeden önce işaretli eşyayı taşı.",
      missingCatalogItem: "Bu eşya artık oda kataloğunda yok.",
      invalidCurrentRotation: "Bu eşya mevcut yönünde gösterilemiyor.",
      clearAvatarPath: "Kaydetmeden önce avatarın için açık bir yol bırak.",
      saveBeforeReset: "Sıfırlamadan önce odanı Blumi’ye kaydet.",
      overlapsFurniture: "Başka bir eşya burada duruyor.",
      outsideFloor: "Eşyayı oda zemininin içinde tut.",
      invalidSurface: "Bu eşyayı uyumlu duvar veya tavan yüzeyinde tut.",
      missingSupport: "Bu eşyayı uygun bir masa veya destek yüzeyine yerleştir.",
      blocksAvatarPath: "Bu konum avatarın yolunu kapatıyor.",
      tightButUsable: "Dar ama kullanılabilir."
    },
    surfaceDrop: {
      floor: "Eşyayı oda zeminine sürükle.",
      wall: "Eşyayı duvara sürükle.",
      ceiling: "Eşyayı tavan alanına sürükle.",
      tabletop: "Eşyayı masa veya destek yüzeyine sürükle."
    },
    unsavedDialog: {
      title: "Oda değişiklikleri kaydedilsin mi?",
      body: "Henüz kaydetmediğin değişiklikler var.",
      stay: "Düzenlemeye devam et",
      discard: "Değişiklikleri sil"
    },
    readiness: {
      ready: "Avatar yolu açık",
      constrained: "Dar ama kullanılabilir",
      blocked: "Biraz daha alan gerekiyor"
    }
  }
}

export function getMyRoomEditorCopy(locale: AppLocale): MyRoomEditorCopy {
  return EDITOR_COPY[locale]
}
