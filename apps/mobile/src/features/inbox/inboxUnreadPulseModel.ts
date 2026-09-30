/** A new unread conversation draws the eye twice, then the glow rests. */
export const INBOX_UNREAD_PULSE_ITERATIONS = 2
const INBOX_UNREAD_PULSE_MAX_SCALE = 1.45

export interface InboxUnreadPulse {
  /** Number of grow-and-settle cycles; 0 means the glow never moves. */
  iterations: number
  maxScale: number
}

/** An endless pulse kept the UI thread busy for as long as a chat stayed unread. */
export function getInboxUnreadPulse(reduceMotion: boolean): InboxUnreadPulse {
  if (reduceMotion) return { iterations: 0, maxScale: 1 }
  return { iterations: INBOX_UNREAD_PULSE_ITERATIONS, maxScale: INBOX_UNREAD_PULSE_MAX_SCALE }
}
