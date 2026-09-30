import type { AppLocale } from "../session/appLocale"

/** What VoiceOver/TalkBack reads as the My Room stage's value. */
export interface MyRoomStageCopy {
  noItems: string
  itemCount: (count: number) => string
}

const COPY: Record<AppLocale, MyRoomStageCopy> = {
  en: {
    noItems: "No items yet",
    itemCount: (count) => `${count} ${count === 1 ? "item" : "items"}`
  },
  tr: {
    noItems: "Henüz eşya yok",
    itemCount: (count) => `${count} eşya`
  }
}

export function getMyRoomStageCopy(locale: AppLocale): MyRoomStageCopy {
  return COPY[locale]
}
