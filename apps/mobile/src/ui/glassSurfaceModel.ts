export type GlassTone = "light" | "dark" | "accent"

export interface GlassSurfaceColors {
  backgroundColor: string
  borderColor: string
}

const GLASS: Readonly<Record<GlassTone, GlassSurfaceColors>> = {
  light: { backgroundColor: "rgba(255, 255, 255, 0.76)", borderColor: "rgba(255, 255, 255, 0.68)" },
  dark: { backgroundColor: "rgba(32, 22, 42, 0.72)", borderColor: "rgba(255, 255, 255, 0.18)" },
  accent: { backgroundColor: "rgba(255, 226, 238, 0.76)", borderColor: "rgba(255, 255, 255, 0.72)" }
}

// Same hue as each glass tone, fully opaque, with a visible hairline border
// so the surface still reads as a card against the background.
const OPAQUE: Readonly<Record<GlassTone, GlassSurfaceColors>> = {
  light: { backgroundColor: "#FFFFFF", borderColor: "#EBDDE4" },
  dark: { backgroundColor: "#20162A", borderColor: "#3A2E45" },
  accent: { backgroundColor: "#FFE2EE", borderColor: "#F3C9DA" }
}

/** Glass colours, or their opaque fallback under Reduce Transparency (SYS-7). */
export function getGlassSurfaceColors(
  tone: GlassTone,
  reduceTransparency: boolean
): GlassSurfaceColors {
  return reduceTransparency ? OPAQUE[tone] : GLASS[tone]
}
