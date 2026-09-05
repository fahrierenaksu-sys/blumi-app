import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { uiTheme } from "../ui/theme"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  applyRoomStudioRecipe,
  backToMyRoom,
  createRoomStudioPreview,
  createRoomStudioSession,
  hydrateRoomStudioSession,
  restoreRoomStudioLayout,
  type RoomStudioSession
} from "../features/roomStudio/roomStudioSession"
import {
  applyRoomStudioThemeOptions,
  getPinkCloudBedroomRecipeForTheme
} from "../features/roomStudio/roomStudioRecipes"
import {
  getRoomStudioThemeOptions,
  getRoomStudioThemePreset,
  getRoomStudioZoneOptions,
  ROOM_STUDIO_THEME_IDS,
  ROOM_STUDIO_ZONE_IDS,
  type RoomStudioThemeId,
  type RoomStudioZoneId
} from "../features/roomStudio/roomStudioThemeMatrix"
import { ROOM_STUDIO_QA_ASSET_BINDINGS } from "../features/roomStudio/roomStudioQaAssetBindings"
import { resolveRoomStudioQaCatalog } from "../features/roomStudio/roomStudioQaCatalog"
import { ROOM_V2_SHELL_CATALOG } from "../features/roomV2/roomV2.mock"
import { RoomRenderer2D } from "../features/roomV2/components/RoomRenderer2D"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { resolveRoomStudioRuntimeGate } from "../features/roomStudio/roomStudioRuntimeGate"
import { loadRoomStudioQaDecor, saveRoomStudioQaDecor } from "../features/roomStudio/roomStudioPersistence"
import type { UserRoomDecor } from "../features/roomV2/roomV2.types"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_HOME_STUDIO_QA_FLAG,
  BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED_FLAG
} from "../config/env"

const QA_OWNER_FALLBACK = "native-ui-qa-owner"
const ZONE_LABELS: Readonly<Record<RoomStudioZoneId, string>> = {
  sleep: "Uyku köşesi",
  cozyCorner: "Rahat köşe",
  wallStory: "Duvar hikâyesi",
  softAccents: "Yumuşak detaylar"
}

type HomeStudioScreenProps = {
  navigation: { goBack: () => void }
  sessionActor?: { profile?: { userId?: string } }
}

const EMPTY_DECOR: UserRoomDecor = {
  schemaVersion: 3,
  geometryVersion: "home-studio-scene-modules-v1",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: []
}

function selectionsForTheme(theme: RoomStudioThemeId): Record<RoomStudioZoneId, string> {
  return Object.fromEntries(
    getRoomStudioThemeOptions(theme).map((option) => [option.zone, option.id])
  ) as Record<RoomStudioZoneId, string>
}

function isCuratedThemeSelection(selections: Readonly<Record<RoomStudioZoneId, string>>): RoomStudioThemeId | undefined {
  return ROOM_STUDIO_THEME_IDS.find((theme) =>
    getRoomStudioThemeOptions(theme).every((option) => selections[option.zone] === option.id)
  )
}

export function HomeStudioScreen({ navigation, sessionActor }: HomeStudioScreenProps) {
  const { width: viewportWidth } = useWindowDimensions()
  const [originalDecor, setOriginalDecor] = useState<UserRoomDecor>(EMPTY_DECOR)
  const [studioSession, setStudioSession] = useState<RoomStudioSession>()
  const [selectedThemeId, setSelectedThemeId] = useState<RoomStudioThemeId>("rose")
  const [selectedOptions, setSelectedOptions] = useState<Record<RoomStudioZoneId, string>>(
    () => selectionsForTheme("rose")
  )
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle")
  const [qaHydrated, setQaHydrated] = useState(false)
  const ownerId = sessionActor?.profile?.userId ?? QA_OWNER_FALLBACK
  const gate = resolveRoomStudioRuntimeGate({
    isDevelopmentRuntime: typeof __DEV__ === "boolean" && __DEV__,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawFlag: BLUMI_HOME_STUDIO_QA_FLAG,
    visualReviewApproved: BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED_FLAG === "1",
    directionalAssetsApproved: false
  })
  const catalog = useMemo(
    () => resolveRoomStudioQaCatalog(gate, ROOM_STUDIO_QA_ASSET_BINDINGS),
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [gate.enabled, gate.canPreview, gate.canRotate, gate.mode, gate.reason]
  )
  const selectedRecipe = useMemo(() => {
    const themedRecipe = getPinkCloudBedroomRecipeForTheme(selectedThemeId)
    return applyRoomStudioThemeOptions(themedRecipe, selectedOptions)
  }, [selectedOptions, selectedThemeId])
  const previewDecor = useMemo(
    () => createRoomStudioPreview(originalDecor, selectedRecipe),
    [originalDecor, selectedRecipe]
  )
  const displayDecor = studioSession?.draftDecor ?? previewDecor
  const canonicalShell = ROOM_V2_SHELL_CATALOG.find(
    (shell) => shell.id === "room_v2_shell_blumi_world_v1"
  )
  const roomScene = useMemo(
    () => resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: catalog.catalog,
      decor: displayDecor,
      defaultRoomShellId: "room_v2_shell_blumi_world_v1"
    }),
    [catalog.catalog, displayDecor]
  )
  const stageWidth = Math.max(280, Math.min(viewportWidth - 32, 560))
  const stageHeight = stageWidth / (
    (canonicalShell?.canvasSize.width ?? 1254) /
    (canonicalShell?.canvasSize.height ?? 714)
  )
  const curatedTheme = isCuratedThemeSelection(selectedOptions)
  const activeThemeLabel = curatedTheme
    ? getRoomStudioThemePreset(curatedTheme).label
    : "Karışık"

  useEffect(() => {
    let active = true
    setQaHydrated(false)
    setStudioSession(undefined)
    void loadRoomStudioQaDecor(AsyncStorage, ownerId).then((stored) => {
      if (!active) return
      if (stored) {
        setOriginalDecor(stored)
        setStudioSession(hydrateRoomStudioSession(stored))
      } else {
        setOriginalDecor(EMPTY_DECOR)
      }
      setQaHydrated(true)
    })
    return () => { active = false }
  }, [ownerId])

  const selectTheme = useCallback((theme: RoomStudioThemeId) => {
    const nextSelections = selectionsForTheme(theme)
    const nextRecipe = getPinkCloudBedroomRecipeForTheme(theme)
    setSelectedThemeId(theme)
    setSelectedOptions(nextSelections)
    setSaveState("idle")
    if (studioSession) setStudioSession(applyRoomStudioRecipe(studioSession, nextRecipe))
  }, [studioSession])

  const selectZoneOption = useCallback((zone: RoomStudioZoneId, optionId: string) => {
    const nextSelections = { ...selectedOptions, [zone]: optionId }
    const nextRecipe = applyRoomStudioThemeOptions(
      getPinkCloudBedroomRecipeForTheme(selectedThemeId),
      nextSelections
    )
    setSelectedOptions(nextSelections)
    setSaveState("idle")
    if (studioSession) setStudioSession(applyRoomStudioRecipe(studioSession, nextRecipe))
  }, [selectedOptions, selectedThemeId, studioSession])

  const applySelectedTheme = useCallback(() => {
    setStudioSession(createRoomStudioSession(originalDecor, selectedRecipe))
    setSaveState("idle")
  }, [originalDecor, selectedRecipe])

  const saveDraft = useCallback(async () => {
    if (!studioSession) return
    setSaveState("saving")
    try {
      await saveRoomStudioQaDecor(AsyncStorage, ownerId, studioSession.draftDecor)
      setSaveState("saved")
    } catch {
      setSaveState("failed")
    }
  }, [ownerId, studioSession])

  if (!gate.enabled || !catalog.enabled) {
    return (
      <SafeAreaView contentGutter={false} style={styles.blockedScreen}>
        <Text style={styles.blockedTitle}>Home Studio is QA-only</Text>
        <Text style={styles.blockedBody}>
          Enable the isolated Home Studio QA flag in a development or native-ui-test build.
        </Text>
        <Pressable style={styles.backButton} onPress={navigation.goBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!qaHydrated) {
    return (
      <SafeAreaView contentGutter={false} style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#cf3f68" />
        <Text style={styles.loadingText}>Odan hazırlanıyor…</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView contentGutter={false} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Geri" onPress={navigation.goBack} style={styles.iconButton}>
            <Text style={styles.iconText}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BLUMI HOME STUDIO · QA</Text>
            <Text style={styles.title}>Odanı birlikte kuralım</Text>
          </View>
          <View style={styles.qaPill}><Text style={styles.qaPillText}>ADAY</Text></View>
        </View>

        <Text style={styles.subtitle}>
          Hazır bir görünüm seç, sonra odanın dört alanını tek tek kişiselleştir.
        </Text>

        <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
          <RoomRenderer2D
            shell={roomScene.shell}
            renderItems={roomScene.renderItems}
            itemInteractionMode="interact"
            roomVNextRuntimeMode="disabled"
            style={styles.roomRenderer}
            testID="home-studio-canonical-stage"
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Hazır görünümler</Text>
          <Text style={styles.selectionMeta}>{curatedTheme ? "Hazır" : "Özel görünüm"}</Text>
        </View>
        <Text style={styles.hint}>Bir aile seçtiğinde dört alan birlikte uyumlanır.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeRow}>
          {ROOM_STUDIO_THEME_IDS.map((theme) => {
            const active = Boolean(selectedThemeId === theme && curatedTheme)
            const preset = getRoomStudioThemePreset(theme)
            return (
              <Pressable
                key={theme}
                accessibilityRole="button"
                accessibilityLabel={`${preset.label} görünümü`}
                accessibilityState={{ selected: active }}
                onPress={() => selectTheme(theme)}
                style={[styles.themeButton, active && styles.themeButtonActive]}
              >
                <Text style={[styles.themeText, active && styles.themeTextActive]}>{preset.label}</Text>
                <Text style={[styles.themeDescription, active && styles.themeDescriptionActive]}>
                  {preset.description}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Alan seçenekleri</Text>
          <Text style={styles.selectionMeta}>{activeThemeLabel}</Text>
        </View>
        <Text style={styles.hint}>Her alanda dört uyumlu alternatif var; serbest sürükleme yok.</Text>
        <View style={styles.zoneList}>
          {ROOM_STUDIO_ZONE_IDS.map((zone) => {
            const options = getRoomStudioZoneOptions(zone)
            return (
              <View key={zone} style={styles.zoneCard}>
                <Text style={styles.zoneLabel}>{ZONE_LABELS[zone]}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                  {options.map((option) => {
                    const active = selectedOptions[zone] === option.id
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${ZONE_LABELS[zone]}: ${option.themeLabel}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => selectZoneOption(zone, option.id)}
                        style={[styles.optionButton, active && styles.optionButtonActive]}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {option.themeLabel}
                        </Text>
                        <Text style={[styles.optionHint, active && styles.optionHintActive]}>
                          {active ? "Seçili" : "Seç"}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )
          })}
        </View>

        <Text style={styles.sectionTitle}>İlk görünümün</Text>
        <Text style={styles.hint}>
          Seçimin güvenli bir taslak olarak açılır; daha sonra yine değiştirebilirsin.
        </Text>
        {!studioSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Odayı bu görünümle aç"
            style={styles.primaryButton}
            onPress={applySelectedTheme}
          >
            <Text style={styles.primaryButtonText}>Odayı bu görünümle aç</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Düzeni sıfırla"
                style={styles.secondaryButton}
                onPress={() => setStudioSession(restoreRoomStudioLayout(studioSession))}
              >
                <Text style={styles.secondaryText}>Düzeni sıfırla</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Odama dön"
                style={styles.secondaryButton}
                onPress={() => setStudioSession(backToMyRoom(studioSession))}
              >
                <Text style={styles.secondaryText}>Odama dön</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saveState === "saved" ? "Taslak kaydedildi" : "Taslağı kaydet"}
              style={styles.primaryButton}
              onPress={() => { void saveDraft() }}
            >
              <Text style={styles.primaryButtonText}>
                {saveState === "saving" ? "Kaydediliyor…" : saveState === "saved" ? "Taslak kaydedildi" : "Taslağı kaydet"}
              </Text>
            </Pressable>
            {saveState === "failed" ? <Text style={styles.errorText}>Taslak kaydedilemedi.</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff7fa" },
  blockedScreen: { flex: 1, padding: 28, justifyContent: "center", backgroundColor: "#fff7fa" },
  blockedTitle: { ...uiTheme.font.title, color: "#4d1835", marginBottom: 12 },
  blockedBody: { ...uiTheme.font.body, color: "#80687a", lineHeight: 24, marginBottom: 24 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#fff7fa" },
  loadingText: { ...uiTheme.font.bodySmall, color: "#80687a" },
  content: { padding: 16, paddingBottom: 40, alignItems: "center" },
  header: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { ...uiTheme.font.caption, color: "#cc3f69", fontWeight: "800", letterSpacing: 1 },
  title: { ...uiTheme.font.title, color: "#4d1835", marginTop: 2 },
  subtitle: { ...uiTheme.font.bodySmall, color: "#80687a", width: "100%", marginTop: 10, marginBottom: 14, lineHeight: 20 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 34, color: "#bd3b63", lineHeight: 36 },
  qaPill: { backgroundColor: "#ffe1ea", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  qaPillText: { ...uiTheme.font.caption, color: "#b63d62", fontWeight: "800" },
  stage: { overflow: "hidden", borderRadius: 22, backgroundColor: "#f9e8e6", borderWidth: 1, borderColor: "#f4cdd8", position: "relative" },
  roomRenderer: { width: "100%", backgroundColor: "transparent" },
  sectionHeaderRow: { width: "100%", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 20 },
  sectionTitle: { ...uiTheme.font.heading, color: "#4d1835" },
  selectionMeta: { ...uiTheme.font.caption, color: "#b63d62", fontWeight: "800" },
  hint: { ...uiTheme.font.bodySmall, color: "#80687a", width: "100%", marginTop: 5, lineHeight: 20 },
  themeRow: { gap: 8, paddingVertical: 12 },
  themeButton: { width: 126, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#f0dce5" },
  themeButtonActive: { backgroundColor: "#cf3f68", borderColor: "#cf3f68" },
  themeText: { ...uiTheme.font.bodyBold, color: "#7b6175" },
  themeTextActive: { color: "#fff" },
  themeDescription: { ...uiTheme.font.caption, color: "#a28b9c", marginTop: 3, lineHeight: 15 },
  themeDescriptionActive: { color: "#ffeaf0" },
  zoneList: { width: "100%", gap: 10, marginTop: 12 },
  zoneCard: { width: "100%", backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#f0dce5", padding: 12 },
  zoneLabel: { ...uiTheme.font.bodyBold, color: "#4d1835", marginBottom: 8 },
  optionRow: { gap: 8 },
  optionButton: { width: 78, minHeight: 48, borderRadius: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#fff7fa", borderWidth: 1, borderColor: "#eadbe5" },
  optionButtonActive: { backgroundColor: "#ffe0e9", borderColor: "#cf3f68" },
  optionText: { ...uiTheme.font.bodySmall, color: "#80687a", fontWeight: "800" },
  optionTextActive: { color: "#b63d62" },
  optionHint: { ...uiTheme.font.caption, color: "#ab96a7", marginTop: 2 },
  optionHintActive: { color: "#cf3f68", fontWeight: "800" },
  primaryButton: { width: "100%", backgroundColor: "#cf3f68", paddingVertical: 16, borderRadius: 18, alignItems: "center", marginTop: 16 },
  primaryButtonText: { ...uiTheme.font.bodyBold, color: "#fff" },
  actionRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 16 },
  secondaryButton: { flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: "#ffe4ec" },
  secondaryText: { ...uiTheme.font.bodySmall, color: "#b33c60", fontWeight: "800" },
  errorText: { ...uiTheme.font.bodySmall, color: "#b33c60", marginTop: 10 },
  backButton: { backgroundColor: "#cf3f68", paddingVertical: 15, borderRadius: 16, alignItems: "center" },
  backButtonText: { ...uiTheme.font.bodyBold, color: "#fff" }
})
