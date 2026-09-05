/**
 * dummyProfiles – 10 dummy buddies for offline/demo testing.
 *
 * Two profiles (Defne Yıldız and Ceren Aksoy) have `hasLikedMe: true`,
 * meaning swiping right on them will trigger a mutual match.
 */

export interface DummyProfile {
  userId: string
  firstName: string
  lastName: string
  displayName: string
  age: number
  /** Placeholder photo URL — avatar component will use initials when offline */
  photoUrl: string
  /** Demo gallery count for photo progress indicators. */
  photoUrls?: string[]
  bio: string
  distance: number
  hasLikedMe: boolean
  prompt?: string
  signals?: string[]
  badges?: string[]
}

export const DUMMY_PROFILES: DummyProfile[] = [
  {
    userId: "demo-user-001",
    firstName: "Defne",
    lastName: "Yıldız",
    displayName: "Defne Yıldız",
    age: 24,
    photoUrl: "https://i.pravatar.cc/400?img=1",
    photoUrls: [
      "https://i.pravatar.cc/400?img=1",
      "https://i.pravatar.cc/400?img=11",
      "https://i.pravatar.cc/400?img=21",
      "https://i.pravatar.cc/400?img=31",
    ],
    bio: "Coffee lover ☕ Photography and travel",
    distance: 85,
    hasLikedMe: true,
    prompt: "Pazar günüm kahve, fotoğraf ve yeni bir sokak keşfiyle güzel geçer.",
    signals: ["Coffee lover", "Photography", "Travel"],
    badges: ["Kendi Tarzı", "Profilini Anlat"]
  },
  {
    userId: "demo-user-002",
    firstName: "Ece",
    lastName: "Korkmaz",
    displayName: "Ece Korkmaz",
    age: 27,
    photoUrl: "https://i.pravatar.cc/400?img=5",
    photoUrls: [
      "https://i.pravatar.cc/400?img=5",
      "https://i.pravatar.cc/400?img=15",
      "https://i.pravatar.cc/400?img=25",
    ],
    bio: "Yoga instructor 🧘‍♀️ Dog mom",
    distance: 210,
    hasLikedMe: false,
    prompt: "Beni tanımak için en iyi yol: köpeğimle uzun bir yürüyüşe katılmak.",
    signals: ["Yoga", "Dogs"],
    badges: ["İlk Odam"]
  },
  {
    userId: "demo-user-003",
    firstName: "Ceren",
    lastName: "Aksoy",
    displayName: "Ceren Aksoy",
    age: 23,
    photoUrl: "https://i.pravatar.cc/400?img=9",
    photoUrls: [
      "https://i.pravatar.cc/400?img=9",
      "https://i.pravatar.cc/400?img=19",
      "https://i.pravatar.cc/400?img=29",
      "https://i.pravatar.cc/400?img=39",
    ],
    bio: "Musician 🎵 Guitar and piano",
    distance: 45,
    hasLikedMe: true,
    prompt: "Bir şarkıyı birlikte seçip ilk notayı çalmaya her zaman varım.",
    signals: ["Music", "Guitar", "Piano"],
    badges: ["Kendi Tarzı", "Kombin Küratörü"]
  },
  {
    userId: "demo-user-004",
    firstName: "Selin",
    lastName: "Demir",
    displayName: "Selin Demir",
    age: 26,
    photoUrl: "https://i.pravatar.cc/400?img=16",
    photoUrls: [
      "https://i.pravatar.cc/400?img=16",
      "https://i.pravatar.cc/400?img=26",
      "https://i.pravatar.cc/400?img=36",
    ],
    bio: "Graphic designer 🎨 Minimalism enthusiast",
    distance: 320,
    hasLikedMe: false
  },
  {
    userId: "demo-user-005",
    firstName: "İrem",
    lastName: "Çelik",
    displayName: "İrem Çelik",
    age: 25,
    photoUrl: "https://i.pravatar.cc/400?img=20",
    photoUrls: [
      "https://i.pravatar.cc/400?img=20",
      "https://i.pravatar.cc/400?img=30",
      "https://i.pravatar.cc/400?img=40",
    ],
    bio: "Bookworm 📚 Science fiction and philosophy",
    distance: 150,
    hasLikedMe: false
  },
  {
    userId: "demo-user-006",
    firstName: "Irmak",
    lastName: "Arı",
    displayName: "Irmak Arı",
    age: 24,
    photoUrl: "https://i.pravatar.cc/400?img=25",
    photoUrls: [
      "https://i.pravatar.cc/400?img=25",
      "https://i.pravatar.cc/400?img=35",
      "https://i.pravatar.cc/400?img=45",
      "https://i.pravatar.cc/400?img=55",
    ],
    bio: "Software engineer 💻 Startup life",
    distance: 95,
    hasLikedMe: true
  },
  {
    userId: "demo-user-007",
    firstName: "Elif",
    lastName: "Aydın",
    displayName: "Elif Aydın",
    age: 22,
    photoUrl: "https://i.pravatar.cc/400?img=32",
    photoUrls: [
      "https://i.pravatar.cc/400?img=32",
      "https://i.pravatar.cc/400?img=42",
      "https://i.pravatar.cc/400?img=52",
    ],
    bio: "Dancer 💃 Salsa and bachata",
    distance: 60,
    hasLikedMe: false
  },
  {
    userId: "demo-user-008",
    firstName: "Buse",
    lastName: "Şahin",
    displayName: "Buse Şahin",
    age: 29,
    photoUrl: "https://i.pravatar.cc/400?img=36",
    photoUrls: [
      "https://i.pravatar.cc/400?img=36",
      "https://i.pravatar.cc/400?img=46",
      "https://i.pravatar.cc/400?img=56",
    ],
    bio: "Chef 🍳 World cuisines",
    distance: 180,
    hasLikedMe: false
  },
  {
    userId: "demo-user-009",
    firstName: "Melis",
    lastName: "Öztürk",
    displayName: "Melis Öztürk",
    age: 24,
    photoUrl: "https://i.pravatar.cc/400?img=41",
    photoUrls: [
      "https://i.pravatar.cc/400?img=41",
      "https://i.pravatar.cc/400?img=51",
      "https://i.pravatar.cc/400?img=61",
    ],
    bio: "Fitness and outdoors 🏃‍♀️ Hiking",
    distance: 270,
    hasLikedMe: false
  },
  {
    userId: "demo-user-010",
    firstName: "Ayşe",
    lastName: "Yılmaz",
    displayName: "Ayşe Yılmaz",
    age: 26,
    photoUrl: "https://i.pravatar.cc/400?img=47",
    photoUrls: [
      "https://i.pravatar.cc/400?img=47",
      "https://i.pravatar.cc/400?img=57",
      "https://i.pravatar.cc/400?img=67",
    ],
    bio: "Lawyer ⚖️ Human rights",
    distance: 130,
    hasLikedMe: false
  }
]

export const DEMO_CURRENT_USER = {
  userId: "demo-me-001",
  displayName: "You",
  age: 25
}

/** Get profiles that have liked the current user */
export function getProfilesWhoLikedMe(): DummyProfile[] {
  return DUMMY_PROFILES.filter((p) => p.hasLikedMe)
}

/** Check if swiping right on this user should trigger a match */
export function shouldTriggerMatch(userId: string): boolean {
  const profile = DUMMY_PROFILES.find((p) => p.userId === userId)
  return profile?.hasLikedMe === true
}
