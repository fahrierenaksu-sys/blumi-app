/**
 * Frame math for the keyboard glue (ui/keyboard.tsx). Plain worklets with no
 * imports, so the UI thread can call them and node tests can run them.
 */

/**
 * How far a glued footer has risen above its resting place. `keyboardHeight`
 * is the library's keyboard translation (negative while open; the sign is
 * ignored), `progress` its open fraction (0 closed, 1 open) and `bottomInset`
 * the safe-area padding the footer already has, which rests on the keyboard
 * instead of adding a gap (CHT-03). Matches KeyboardStickyView's
 * `offset={{ closed: 0, opened: bottomInset }}` exactly.
 */
export function getGluedFooterLift(keyboardHeight: number, progress: number, bottomInset: number): number {
  "worklet"
  const open = Math.min(1, Math.max(0, progress))
  return Math.max(0, Math.abs(keyboardHeight) - open * Math.max(0, bottomInset))
}
