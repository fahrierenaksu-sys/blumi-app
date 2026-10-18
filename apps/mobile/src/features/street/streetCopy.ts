import type { StreetChangeKind } from "@blumi/contracts"
import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

export interface StreetCopy {
  title: string
  newsNote: (count: number) => string
  calmNote: string
  self: string
  emptyWindow: string
  buildingStreet: string
  growingStreet: string
  closedWindow: string
  railLabel: (count: number) => string
  windowHint: string
  closedHint: string
  openChatAction: string
  unread: (count: number) => string
  thisMorning: string
  yesterday: string
  today: string
  close: string
  changes: Readonly<Record<StreetChangeKind, string>>
  starters: Readonly<Record<StreetChangeKind | "none", readonly [string, string]>>
  infoTitle: string
  infoBody: string
  infoOk: string
  infoSettings: string
  settingLabel: string
  settingNote: string
  /** Notes prototype. */
  leaveNote: string
  notePlaceholder: string
  shareNote: string
  removeNote: string
  cancel: string
  noteLabel: (name: string, note: string) => string
  replyPlaceholder: string
  send: string
  demoReplyTitle: string
  demoReplyBody: string
  guestCat: string
}

const TR: StreetCopy = {
  title: "Sokağın",
  newsNote: (count) => `${count} pencerede yenilik var`,
  calmNote: "Bu sabah sokak sakin",
  self: "Sen",
  emptyWindow: "Komşu bul",
  buildingStreet: "Sokağın kuruluyor. Karşılıklı eşleştiğin herkesin penceresi burada açılır.",
  growingStreet: "Yeni eşleşmelerin geldikçe sokağın dolar.",
  closedWindow: "Perdeleri kapalı",
  railLabel: (count) => `Sokağın, ${count} pencere`,
  windowHint: "Odasını açar.",
  closedHint: "Sohbeti açar.",
  openChatAction: "Sohbeti aç",
  unread: (count) => `${count} okunmamış mesaj`,
  thisMorning: "Bu sabah",
  yesterday: "Dün",
  today: "Bugün",
  close: "Kapat",
  changes: {
    guest: "misafir var",
    dress: "yeni elbise",
    outfit: "yeni kombin",
    hair: "yeni saç",
    shoes: "yeni ayakkabı",
    accessory: "yeni aksesuar",
    rug: "yeni halı",
    bed: "yeni yatak",
    seat: "yeni koltuk",
    wall: "yeni tablo",
    shelf: "yeni raf",
    item: "yeni eşya",
    layout: "yeni düzen"
  },
  starters: {
    guest: ["Misafirin çok tatlı!", "Kedi senin odanı seçmiş 🐾"],
    dress: ["Yeni elbisen çok yakışmış", "Bu elbise nereden?"],
    outfit: ["Yeni kombinin çok güzel", "Bu kombin tam sen olmuş"],
    hair: ["Yeni saçın çok yakışmış", "Saçını çok sevdim"],
    shoes: ["Ayakkabıların çok tatlı", "Yeni ayakkabılar mı?"],
    accessory: ["Aksesuarın çok tatlı", "Bu aksesuar sana çok yakışmış"],
    rug: ["Yeni halın odayı değiştirmiş", "Halın çok tatlı"],
    bed: ["Yeni yatağın çok rahat görünüyor", "Odan çok güzel olmuş"],
    seat: ["Yeni koltuğun çok rahat görünüyor", "Odan çok güzel olmuş"],
    wall: ["Duvarın çok güzel olmuş", "Bu tablo çok tatlı"],
    shelf: ["Yeni rafın çok güzel", "Odan çok derli toplu"],
    item: ["Odana yeni bir şey gelmiş", "Odan çok güzel olmuş"],
    layout: ["Odanı yeniden düzenlemişsin", "Yeni düzen çok güzel"],
    none: ["Odan çok güzel", "Günün nasıl geçiyor?"]
  },
  infoTitle: "Evin sokakta",
  infoBody: "Karşılıklı eşleştiğin kişiler odanı ve görünüşünü Sohbetler'deki sokakta görür. Pencereni istediğin zaman Ayarlar'dan kapatabilirsin.",
  infoOk: "Anladım",
  infoSettings: "Ayarlar",
  settingLabel: "Penceremi sokakta göster",
  settingNote: "Kapalıyken eşleşmelerin yalnızca perdeleri kapalı pencereni ve adını görür.",
  leaveNote: "Not bırak",
  notePlaceholder: "Aklından ne geçiyor?",
  shareNote: "Paylaş",
  removeNote: "Notu kaldır",
  cancel: "Vazgeç",
  noteLabel: (name, note) => `${name} not bıraktı: ${note}`,
  replyPlaceholder: "Notuna yanıt yaz…",
  send: "Gönder",
  demoReplyTitle: "Deneme",
  demoReplyBody: "Gerçekte yanıtın, notu alıntılayarak sohbetinize mesaj olarak düşer.",
  guestCat: "Penceresinde misafir kedi var"
}

const EN: StreetCopy = {
  ...TR,
  title: "Your street",
  newsNote: (count) => `${count} window${count === 1 ? "" : "s"} with news`,
  calmNote: "The street is calm this morning",
  self: "You",
  emptyWindow: "Find neighbours",
  buildingStreet: "Your street is being built. Everyone you match with opens a window here.",
  growingStreet: "Your street fills up as new matches arrive.",
  closedWindow: "Curtains closed",
  railLabel: (count) => `Your street, ${count} window${count === 1 ? "" : "s"}`,
  windowHint: "Opens their room.",
  closedHint: "Opens the chat.",
  openChatAction: "Open chat",
  unread: (count) => `${count} unread message${count === 1 ? "" : "s"}`,
  thisMorning: "This morning",
  yesterday: "Yesterday",
  today: "Today",
  close: "Close",
  infoTitle: "Your home is on the street",
  infoBody: "Your mutual matches see your room and look on the street in Chats. You can close your window any time in Settings.",
  infoOk: "Got it",
  infoSettings: "Settings",
  settingLabel: "Show my window on the street",
  settingNote: "When off, matches see only your closed curtains and your name.",
  leaveNote: "Leave a note",
  notePlaceholder: "What's on your mind?",
  shareNote: "Share",
  removeNote: "Remove note",
  cancel: "Cancel",
  noteLabel: (name, note) => `${name} left a note: ${note}`,
  replyPlaceholder: "Reply to their note…",
  send: "Send",
  demoReplyTitle: "Demo",
  demoReplyBody: "For real, your reply lands in your chat as a message quoting the note.",
  guestCat: "A guest cat is in their window"
}

export function getStreetCopy(locale: AccountRecoveryLocale): StreetCopy {
  return locale === "en" ? EN : TR
}
