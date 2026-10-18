import type { StreetResponse, StreetRoom, StreetWindow } from "@blumi/contracts"

/**
 * Sokağım notes prototype (2026-10-18): a dev-build-only street of made-up neighbours, so the note bubbles, the
 * window light and the guest cat can be tried on a phone before any server work. Never on in a release build, and
 * nothing here is sent anywhere.
 */
export const IS_STREET_NOTES_DEMO_ENABLED: boolean =
  typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_BLUMI_STREET_NOTES_DEMO === "1"

export const STREET_DEMO_THREAD_PREFIX = "street-demo-"

type DemoAvatar = StreetWindow["avatar"]

interface DemoNeighbour {
  name: string
  note: string | null
  change: StreetWindow["change"]
  closed: boolean
  unread: number
  /** Extra furniture in front of the portrait spot, on top of the base room. */
  extras: StreetRoom["placedItems"]
}

const DEMO_NEIGHBOURS: readonly DemoNeighbour[] = [
  {
    name: "Defne",
    note: "Bu akşam film önerisi lazım 🍿",
    change: "rug",
    closed: false,
    unread: 2,
    extras: [{ itemId: "room_v3_rug_oyun_cloud", x: 0.5, y: 0.7, rotation: "front" }]
  },
  {
    name: "Kaan",
    note: null,
    change: "guest",
    closed: false,
    unread: 0,
    extras: [{ itemId: "room_v3_pouf_oyun_bunnymint", x: 0.6, y: 0.66, rotation: "front" }]
  },
  {
    name: "Ece",
    note: "Odamı baştan yaptım, nasıl olmuş? 🌸",
    change: "layout",
    closed: false,
    unread: 0,
    extras: [
      { itemId: "room_v3_rug_japon_botanic", x: 0.5, y: 0.7, rotation: "front" },
      { itemId: "room_v3_pouf_oyun_bunnypink", x: 0.38, y: 0.66, rotation: "front" }
    ]
  },
  {
    name: "Selin",
    note: "Kahve mi çay mı? ☕",
    change: null,
    closed: false,
    unread: 0,
    extras: [{ itemId: "room_v3_teaset_oyun_flower", x: 0.6, y: 0.68, rotation: "front" }]
  },
  { name: "Arda", note: null, change: null, closed: true, unread: 0, extras: [] }
]

export interface StreetNotesDemo {
  street: StreetResponse
  /** Notes by window thread id. */
  notes: Readonly<Record<string, string>>
}

/**
 * The demo street: the viewer's own room as everyone's base (so the rooms look real), a few pieces in front of
 * each neighbour, and the looks of the viewer's chat partners lent to the made-up names.
 */
export function buildStreetNotesDemo(input: {
  edition: string
  self: StreetResponse["self"] | null
  partnerAvatars: readonly DemoAvatar[]
}): StreetNotesDemo {
  const baseRoom: StreetRoom = input.self?.room ?? { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
  const windows = DEMO_NEIGHBOURS.map((neighbour, index): StreetWindow => ({
    threadId: `${STREET_DEMO_THREAD_PREFIX}${index}`,
    displayName: neighbour.name,
    closed: neighbour.closed,
    avatar: input.partnerAvatars.length > 0 ? input.partnerAvatars[index % input.partnerAvatars.length] ?? null : null,
    room: neighbour.closed ? null : { ...baseRoom, placedItems: [...baseRoom.placedItems, ...neighbour.extras] },
    change: neighbour.closed ? null : neighbour.change,
    unread: neighbour.unread
  }))
  const notes = Object.fromEntries(
    DEMO_NEIGHBOURS.flatMap((neighbour, index) =>
      neighbour.note && !neighbour.closed ? [[`${STREET_DEMO_THREAD_PREFIX}${index}`, neighbour.note]] : [])
  )
  return {
    street: { edition: input.edition, self: input.self ?? { closed: false, room: baseRoom }, windows },
    notes
  }
}

export function isStreetDemoThread(threadId: string): boolean {
  return threadId.startsWith(STREET_DEMO_THREAD_PREFIX)
}
