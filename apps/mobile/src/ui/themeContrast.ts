/**
 * WCAG 2.2 contrast for Blumi's themed text.
 *
 * `themeTextPairs` lists every text/background token pairing the UI draws:
 * body copy on surfaces, labels on pink actions, ink on soft status fills.
 * The guard test computes each ratio from the theme source, so a token change
 * that makes any themed text unreadable fails before it ships. Pairs drawn in
 * style sources (including hard-coded colours) are found by
 * `testing/styleContrastPairs.ts` and checked by `styleContrastPairs.test.ts`.
 */

/** Minimum ratios: WCAG 1.4.3 for text, and a legibility floor for disabled labels. */
export const MIN_CONTRAST = {
  text: 4.5,
  largeText: 3,
  disabledText: 3
} as const

export type ContrastRole = keyof typeof MIN_CONTRAST

export interface ThemeTextPair {
  readonly use: string
  readonly foreground: string
  readonly backgrounds: readonly string[]
  readonly role: ContrastRole
}

interface ContrastTheme {
  readonly colors: Readonly<Record<string, string>>
  readonly gradients: { readonly primary: readonly string[] }
}

const HEX_COLOR = /^#([0-9a-f]{6})$/i

function channelLuminance(channel: number): number {
  const value = channel / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex)
  if (!match) throw new Error(`Contrast needs an opaque #RRGGBB colour, got ${hex}`)
  const value = Number.parseInt(match[1], 16)
  const red = channelLuminance((value >> 16) & 0xff)
  const green = channelLuminance((value >> 8) & 0xff)
  const blue = channelLuminance(value & 0xff)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

export function themeTextPairs(theme: ContrastTheme): readonly ThemeTextPair[] {
  const c = theme.colors
  const pageSurfaces = [c.background, c.backgroundWarm, c.surface, c.surfaceSoft, c.surfaceMuted, c.surfaceRaised, c.secondary]
  return [
    { use: "body text on page surfaces", foreground: c.textPrimary, backgrounds: pageSurfaces, role: "text" },
    { use: "secondary text on page surfaces", foreground: c.textSecondary, backgrounds: pageSurfaces, role: "text" },
    { use: "muted captions on page surfaces", foreground: c.textMuted, backgrounds: pageSurfaces, role: "text" },
    { use: "error text on page surfaces", foreground: c.danger, backgrounds: pageSurfaces, role: "text" },
    { use: "pink links and soft-button labels", foreground: c.primaryDeep, backgrounds: [c.surface, c.background, c.primarySoft], role: "text" },
    { use: "secondary button label", foreground: c.secondaryText, backgrounds: [c.secondary, c.secondaryPressed], role: "text" },
    { use: "chip label", foreground: c.chipText, backgrounds: [c.chipBackground], role: "text" },
    { use: "label on pink actions", foreground: c.onPrimary, backgrounds: [c.primary, c.primaryPressed, ...theme.gradients.primary], role: "text" },
    { use: "label on a disabled pink action", foreground: c.onPrimary, backgrounds: [c.primaryDisabled], role: "disabledText" },
    { use: "white label on dark and deep actions", foreground: c.textInverted, backgrounds: [c.actionDark, c.actionDarkPressed, c.primaryDeep, c.danger], role: "text" },
    { use: "success ink on its soft fill", foreground: c.successInk, backgrounds: [c.successSoft], role: "text" },
    { use: "warning ink on its soft fill", foreground: c.warningInk, backgrounds: [c.warningSoft], role: "text" },
    { use: "danger ink on its soft fill", foreground: c.dangerInk, backgrounds: [c.dangerSoft], role: "text" },
    { use: "gold ink on its soft fill", foreground: c.goldInk, backgrounds: [c.goldSoft], role: "text" }
  ]
}
