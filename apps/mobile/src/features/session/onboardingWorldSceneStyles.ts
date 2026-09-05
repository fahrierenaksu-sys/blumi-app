import { StyleSheet } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import {
  ONBOARDING_WORLD_GLOBE_SIZE,
  ONBOARDING_WORLD_TEXTURE_WIDTH
} from "./onboardingWorldCompositionModel"
import { ONBOARDING_POPULATION_COUNTER_LAYOUT } from "./onboardingPopulationCounterModel"

export const ONBOARDING_GLOBE_SIZE = ONBOARDING_WORLD_GLOBE_SIZE
export const ONBOARDING_TEXTURE_WIDTH = ONBOARDING_WORLD_TEXTURE_WIDTH

export const onboardingWorldSceneStyles = StyleSheet.create({
  scene: {
    flex: 1,
    minHeight: 548,
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  sceneCompact: { minHeight: 442 },
  sceneContent: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 18
  },
  worldComposition: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  preludeOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8
  },
  populationStat: {
    position: "absolute",
    width: "100%",
    maxWidth: 356,
    minHeight: 102,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    zIndex: 6
  },
  populationStatCompact: { minHeight: 92 },
  populationLead: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primaryDeep,
    textAlign: "center"
  },
  populationValue: {
    fontFamily: "Inter_900Black",
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: -1.8,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  populationValueCompact: { fontSize: 34, lineHeight: 40 },
  populationValueViewport: {
    alignSelf: "stretch",
    height: 46,
    marginTop: 2,
    marginHorizontal: -18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  populationValueViewportCompact: { height: 40 },
  populationOdometerRow: {
    height: 46,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center"
  },
  populationDigitColumn: {
    width: ONBOARDING_POPULATION_COUNTER_LAYOUT.digitWidth,
    height: 46,
    overflow: "hidden",
    alignItems: "center"
  },
  populationDigitColumnCompact: {
    width: ONBOARDING_POPULATION_COUNTER_LAYOUT.compactDigitWidth,
    height: 40
  },
  populationDigitStrip: {
    width: "100%"
  },
  populationDigitCellFrame: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  populationDigitCell: {
    width: "100%"
  },
  populationSeparator: { width: 11 },
  populationSeparatorCompact: { width: 9 },
  populationPlus: { width: 25 },
  populationTail: {
    ...uiTheme.font.bodySmall,
    marginTop: -1,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  worldStage: {
    position: "absolute",
    width: ONBOARDING_WORLD_GLOBE_SIZE + 36,
    height: ONBOARDING_WORLD_GLOBE_SIZE + 116,
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "center"
  },
  worldStageCompact: {
    marginBottom: -18
  },
  worldAura: {
    position: "absolute",
    bottom: 0,
    width: ONBOARDING_WORLD_GLOBE_SIZE + 28,
    height: ONBOARDING_WORLD_GLOBE_SIZE + 28,
    borderRadius: (ONBOARDING_WORLD_GLOBE_SIZE + 28) / 2,
    backgroundColor: "rgba(247,196,207,0.14)",
    shadowColor: "#F0AFC0",
    shadowOpacity: 0.18,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 8 }
  },
  impactRing: {
    position: "absolute",
    bottom: ONBOARDING_WORLD_GLOBE_SIZE - 2,
    width: 164,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    backgroundColor: "rgba(247,196,207,0.08)",
    shadowColor: "#F0AFC0",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  globeWrap: {
    position: "absolute",
    bottom: 18,
    width: ONBOARDING_WORLD_GLOBE_SIZE,
    height: ONBOARDING_WORLD_GLOBE_SIZE,
    borderRadius: ONBOARDING_WORLD_GLOBE_SIZE / 2,
    shadowColor: "#347F98",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 }
  },
  globeClip: {
    flex: 1,
    borderRadius: ONBOARDING_WORLD_GLOBE_SIZE / 2,
    overflow: "hidden",
    backgroundColor: "#9DDFEC"
  },
  textureTrack: {
    height: ONBOARDING_WORLD_GLOBE_SIZE,
    width: ONBOARDING_WORLD_TEXTURE_WIDTH * 2,
    flexDirection: "row"
  },
  texture: {
    width: ONBOARDING_WORLD_TEXTURE_WIDTH,
    height: ONBOARDING_WORLD_GLOBE_SIZE
  },
  globeHighlight: {
    position: "absolute",
    left: -14,
    top: -24,
    width: 214,
    height: 150,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.11)",
    transform: [{ rotate: "-16deg" }]
  },
  globeShade: {
    position: "absolute",
    right: -44,
    bottom: -10,
    width: 152,
    height: 280,
    borderRadius: 130,
    backgroundColor: "rgba(30,65,83,0.09)",
    transform: [{ rotate: "8deg" }]
  },
  globeAtmosphereEdge: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: ONBOARDING_WORLD_GLOBE_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.58)"
  },
  pairRig: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4
  },
  heroPair: {
    position: "absolute",
    bottom: ONBOARDING_WORLD_GLOBE_SIZE + 6,
    alignSelf: "center",
    width: 176,
    height: 138,
    zIndex: 4
  },
  heroCharacter: {
    position: "absolute",
    bottom: 0,
    width: 108,
    height: 178,
    alignItems: "center"
  },
  // These offsets match the first runner foot anchors so the final landing
  // pose hands off without sliding inward or teleporting vertically.
  heroMale: { left: 15 },
  heroFemale: { right: 21 },
  heroRunnerImage: { width: 108, height: 178 },
  runners: {
    position: "absolute",
    left: 18,
    bottom: 18,
    width: ONBOARDING_WORLD_GLOBE_SIZE,
    height: ONBOARDING_WORLD_GLOBE_SIZE + 72,
    zIndex: 5
  },
  runnerCrownMask: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
    height: 16,
    overflow: "hidden",
    zIndex: 6
  },
  runnerCrownCircle: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ONBOARDING_WORLD_GLOBE_SIZE,
    height: ONBOARDING_WORLD_GLOBE_SIZE,
    borderRadius: ONBOARDING_WORLD_GLOBE_SIZE / 2,
    overflow: "hidden"
  },
  runnerCrownTextureTrack: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ONBOARDING_WORLD_TEXTURE_WIDTH * 2,
    height: ONBOARDING_WORLD_GLOBE_SIZE,
    flexDirection: "row"
  },
  runnerCrownTexture: {
    width: ONBOARDING_WORLD_TEXTURE_WIDTH,
    height: ONBOARDING_WORLD_GLOBE_SIZE
  },
  runnerCrownRim: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 0,
    bottom: 1,
    borderRadius: ONBOARDING_WORLD_GLOBE_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.34)"
  },
  skipButton: {
    position: "absolute",
    left: 12,
    top: 10,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  skipText: { ...uiTheme.font.bodySmall, color: uiTheme.colors.textMuted },
  pressed: { opacity: 0.72 }
})
