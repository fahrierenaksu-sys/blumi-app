import type { AppLocale } from "../session/appLocale"

// User-facing and VoiceOver text for the onboarding room setup step.
export interface RoomSetupCopy {
  readonly headerTitle: string
  readonly completionLabel: string
  readonly summaryTitle: string
  readonly giftBadge: string
  readonly bedPlacedSummary: string
  readonly bedPendingSummary: string
  readonly roomAccessibilityLabel: string
  readonly avatarName: string
  readonly moveBedAccessibilityLabel: string
  readonly rotateBedAccessibilityLabel: string
  readonly bedPlacedAccessibilityLabel: string
  readonly bedPlacedCard: string
  readonly starterItemAccessibilityLabel: string
  readonly starterItemTitle: string
  readonly starterItemHint: string
  readonly placement: {
    readonly roomLoading: string
    readonly chooseAnotherSpot: string
    readonly placed: string
    readonly moveInBeforeRotating: string
    readonly rotated: string
    readonly longPressMove: string
    readonly dragToFloor: string
    readonly tapOrDrag: string
  }
  readonly feedback: {
    readonly mutationRejected: string
    readonly persistenceAttention: string
  }
}

const COPY: Record<AppLocale, RoomSetupCopy> = {
  tr: {
    headerTitle: "İlk odan",
    completionLabel: "Odam hazır",
    summaryTitle: "İlk köşen hazır",
    giftBadge: "HEDİYE",
    bedPlacedSummary: "Pembe Bulut Yatak odanda.",
    bedPendingSummary: "Pembe Bulut Yatağı odana yerleştir.",
    roomAccessibilityLabel: "Başlangıç yatağını odaya yerleştir",
    avatarName: "Blumi karakterin",
    moveBedAccessibilityLabel: "Yatağı taşımak için yatağa basılı tutup sürükle",
    rotateBedAccessibilityLabel: "Pembe Bulut Yatağı çevir",
    bedPlacedAccessibilityLabel: "Pembe Bulut Yatak yerleştirildi",
    bedPlacedCard: "Yatak yerleştirildi",
    starterItemAccessibilityLabel:
      "Pembe Bulut Yatak, ücretsiz başlangıç eşyası. Yerleştirmek için dokun veya odaya sürükle.",
    starterItemTitle: "Pembe Bulut Yatak",
    starterItemHint: "Dokun veya odana sürükle",
    placement: {
      roomLoading: "Odan hazırlanıyor. Birazdan yeniden dene.",
      chooseAnotherSpot: "Odanın zemininde başka bir nokta seç.",
      placed: "Yatağın yerleşti.",
      moveInBeforeRotating: "Çevirmeden önce yatağı biraz içeri taşı.",
      rotated: "Yatak çevrildi. Taşımak için odaya dokun.",
      longPressMove: "Basılı tutup sürükleyerek taşı.",
      dragToFloor: "Yatağı oda zeminine sürükle.",
      tapOrDrag: "Şimdi odada bir noktaya dokun ya da yatağı oraya sürükle."
    },
    feedback: {
      mutationRejected: "Oda değişikliği uygulanamadı. Yeniden dene.",
      persistenceAttention: "Oda kaydıyla ilgili bir sorun var. Güncel düzeni kontrol et."
    }
  },
  en: {
    headerTitle: "Your first room",
    completionLabel: "My room is ready",
    summaryTitle: "Your first corner is ready",
    giftBadge: "GIFT",
    bedPlacedSummary: "The Pink Cloud Bed is in your room.",
    bedPendingSummary: "Place the Pink Cloud Bed in your room.",
    roomAccessibilityLabel: "Place the starter bed in the room",
    avatarName: "Your Blumi character",
    moveBedAccessibilityLabel: "Press and hold the bed, then drag to move it",
    rotateBedAccessibilityLabel: "Rotate the Pink Cloud Bed",
    bedPlacedAccessibilityLabel: "Pink Cloud Bed placed",
    bedPlacedCard: "Bed placed",
    starterItemAccessibilityLabel:
      "Pink Cloud Bed, free starter item. Tap or drag into the room to place it.",
    starterItemTitle: "Pink Cloud Bed",
    starterItemHint: "Tap or drag into your room",
    placement: {
      roomLoading: "Your room is getting ready. Try again in a moment.",
      chooseAnotherSpot: "Choose another spot on the room floor.",
      placed: "Your bed is in place.",
      moveInBeforeRotating: "Move the bed in a little before rotating it.",
      rotated: "Bed rotated. Tap the room to move it.",
      longPressMove: "Press and hold, then drag to move.",
      dragToFloor: "Drag the bed onto the room floor.",
      tapOrDrag: "Now tap a spot in the room or drag the bed there."
    },
    feedback: {
      mutationRejected: "That room change could not be applied. Please try again.",
      persistenceAttention: "Room saving needs attention. Review the current layout."
    }
  }
}

export function getRoomSetupCopy(locale: AppLocale): RoomSetupCopy {
  return COPY[locale]
}
