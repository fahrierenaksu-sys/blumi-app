/** Local-only characters for exercising Discover, chat, and room invitations. */
export interface DummyProfile {
  userId: string
  firstName: string
  lastName: string
  displayName: string
  age: number
  gender: "woman" | "man"
  avatarPresetId: string
  bio: string
  distance: number
  hasLikedMe: boolean
  greeting: string
  replies: readonly [string, string]
  prompt: string
  signals: string[]
}

function profile(
  number: number,
  displayName: string,
  age: number,
  gender: DummyProfile["gender"],
  distance: number,
  bio: string,
  signals: string[],
  greeting: string,
  replies: readonly [string, string]
): DummyProfile {
  const [firstName, ...lastName] = displayName.split(" ")
  return {
    userId: `demo-user-${String(number).padStart(3, "0")}`,
    firstName,
    lastName: lastName.join(" "),
    displayName,
    age,
    gender,
    avatarPresetId: gender === "man" ? "avatar_v2_body_male_light" : "avatar_v2_body_default",
    bio,
    distance,
    hasLikedMe: true,
    greeting,
    replies,
    prompt: bio,
    signals
  }
}

export const DUMMY_PROFILES: DummyProfile[] = [
  profile(1, "Defne Yıldız", 24, "woman", 85, "Kahve, sakin pazarlar ve yeni sokaklar.", ["Kahve", "Yürüyüş"],
    "Selam! Kahve sohbetiyle başlayalım mı? ☕", ["Yeni bir kahveci keşfettim. Senin favorin neresi?", "Sakin bir pazar planı kulağa çok iyi geliyor."]),
  profile(2, "Ece Korkmaz", 27, "woman", 210, "Yoga ve sabah yürüyüşleri bana iyi gelir.", ["Yoga", "Hayvanlar"],
    "Merhaba! Günün nasıl geçiyor?", ["Ben güne kısa bir yürüyüşle başladım.", "Senin için iyi bir hafta sonu nasıl olur?"]),
  profile(3, "Ceren Aksoy", 23, "woman", 45, "Gitar, piyano ve uzun çalma listeleri.", ["Müzik", "Gitar"],
    "Selam! Bugün hangi şarkıyı dinliyorsun? 🎵", ["Bunu çalma listeme ekleyeceğim.", "Müzik dışında neler yaparsın?"]),
  profile(4, "Selin Demir", 26, "woman", 320, "Tasarımcıyım; küçük detaylara dikkat ederim.", ["Tasarım", "Şehir"],
    "Merhaba, profilindeki enerji hoşuma gitti.", ["Şehrin hangi köşesini daha çok seviyorsun?", "Bunu farklı bir açıdan düşünmek ilginç."]),
  profile(5, "İrem Çelik", 25, "woman", 150, "Bilimkurgu kitapları ve gece sohbetleri.", ["Kitap", "Bilimkurgu"],
    "Selam! En son seni etkileyen kitap neydi?", ["Ben bilimkurguda yeni dünyaları seviyorum.", "Kitap dışında hangi konulara dalıp gidersin?"]),
  profile(6, "Irmak Arı", 24, "woman", 95, "Yazılım geliştiriyorum; yeni fikirlere heyecanlanırım.", ["Teknoloji", "Girişim"],
    "Merhaba! Şu sıralar seni ne heyecanlandırıyor?", ["Böyle fikirleri konuşmayı seviyorum.", "Peki bunu birlikte denesek nasıl olur?"]),
  profile(7, "Elif Aydın", 22, "woman", 60, "Dans ve hareketli akşamlar bana iyi gelir.", ["Dans", "Müzik"],
    "Selam! Dans etmeyi sever misin?", ["Ben salsa öğrenmeye yeni başladım.", "Senin en sevdiğin hafta sonu etkinliği ne?"]),
  profile(8, "Buse Şahin", 29, "woman", 180, "Yemek yapmayı ve yeni tatlar keşfetmeyi seviyorum.", ["Yemek", "Seyahat"],
    "Merhaba! Birlikte ne pişirirdik sence?", ["Bugün yeni bir tarif denedim.", "Sen mutfakta deney yapmayı sever misin?"]),
  profile(9, "Mert Kaya", 26, "man", 130, "Mimarlık, eski sokaklar ve iyi kahve.", ["Mimarlık", "Kahve"],
    "Selam! Bu şehirde en sevdiğin yer neresi?", ["Eski sokaklarda kaybolmak güzel geliyor.", "Kahve molası verince her rota daha iyi."]),
  profile(10, "Can Yılmaz", 28, "man", 260, "Bisiklet sürerim, sahil yolunu ezbere bilirim.", ["Bisiklet", "Deniz"],
    "Merhaba! Sahil yürüyüşü mü bisiklet turu mu?", ["Ben bisikleti seçerdim ama yürüyüş de güzel.", "Senin ideal pazar planın ne?"]),
  profile(11, "Arda Demir", 24, "man", 75, "Müzik yapıyorum; konser takvimim hep dolu.", ["Konser", "Müzik"],
    "Selam! Son gittiğin konser hangisiydi?", ["Canlı müzikte enerjim hemen yükselir.", "Bir konser seçsek hangisi olurdu?"]),
  profile(12, "Deniz Acar", 25, "man", 190, "Kitapçıları gezerim, film sonlarını tartışırım.", ["Kitap", "Film"],
    "Merhaba! Bu aralar izlemeye değer bir film var mı?", ["Beklenmedik finalleri seviyorum.", "En sevdiğin tür ne?"]),
  profile(13, "Emre Polat", 27, "man", 110, "Yemek pişiririm; arkadaşlarım tadım ekibimdir.", ["Yemek", "Arkadaşlık"],
    "Selam! En sevdiğin yemek ne?", ["Ben ev yapımı makarnaya hayır demem.", "Tatlı konusunda seçimin ne olur?"]),
  profile(14, "Kerem Ekinci", 29, "man", 340, "Doğada yürümek ve manzara çizmek iyi gelir.", ["Doğa", "Yürüyüş"],
    "Merhaba! Şehirden kaçmak için nereye giderdin?", ["Ben orman yolunu seçerdim.", "Sen doğada en çok neyi seversin?"]),
  profile(15, "Eren Sağlam", 23, "man", 55, "Oyunlar ve yaratıcı projelerle zaman geçer.", ["Oyun", "Tasarım"],
    "Selam! Son oynadığın oyun neydi?", ["Ben hikâyesi güçlü oyunları seviyorum.", "Oyun dışında seni ne meşgul ediyor?"]),
  profile(16, "Bora Aksoy", 26, "man", 225, "Sinema ve uzun akşam sohbetleri favorim.", ["Sinema", "Sohbet"],
    "Merhaba! Unutamadığın bir film var mı?", ["Karakterleri aklımda kalan filmleri severim.", "Birlikte film seçsek hangi tür olurdu?"])
]

export const DEMO_CURRENT_USER = {
  userId: "demo-me-001",
  displayName: "You",
  age: 25
}

export function getProfilesWhoLikedMe(): DummyProfile[] {
  return DUMMY_PROFILES.filter((profile) => profile.hasLikedMe)
}

export function shouldTriggerMatch(userId: string): boolean {
  return DUMMY_PROFILES.some((profile) => profile.userId === userId && profile.hasLikedMe)
}
