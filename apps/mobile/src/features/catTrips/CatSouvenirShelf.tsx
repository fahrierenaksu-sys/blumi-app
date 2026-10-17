import { ScrollView, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import { CAT_TRIP_COPY, getCatSouvenirCopy } from "./catTripCopy"
import type { CatShelfSouvenir } from "./catTripModel"

/**
 * "Kedinin hatıraları": one keepsake per finished trip, cosmetic only and
 * owned by the server (no item id, no coins, never sold). Shows the
 * keepsake alone: never who or when.
 */
export function CatSouvenirShelf(props: { souvenirs: readonly CatShelfSouvenir[]; testID?: string }) {
  const { souvenirs, testID = "cat-souvenir-shelf" } = props
  if (souvenirs.length === 0) return null
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>{CAT_TRIP_COPY.shelfTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {souvenirs.map((souvenir) => {
          const copy = getCatSouvenirCopy(souvenir.key)
          return (
            <View
              key={souvenir.souvenirId}
              style={[styles.item, souvenir.rarity === "rare" ? styles.rare : null]}
              accessible
              accessibilityLabel={copy.label}
            >
              <Text style={styles.glyph}>{copy.glyph}</Text>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingHorizontal: 16 },
  title: { fontSize: 13, fontWeight: "700", color: uiTheme.colors.textSecondary },
  row: { gap: 8 },
  item: { width: 40, height: 40, borderRadius: uiTheme.radius.sm, alignItems: "center", justifyContent: "center",
    backgroundColor: uiTheme.colors.surfaceSoft },
  rare: { borderWidth: 1.5, borderColor: uiTheme.colors.brandPink },
  glyph: { fontSize: 22 },
  strip: { position: "absolute", top: 56, left: 0, right: 0, gap: 6 },
  status: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: uiTheme.radius.full, overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.9)", color: uiTheme.colors.textPrimary, fontSize: 13, fontWeight: "600" }
})

/** The quiet line over My Room: the cat is out, or a guest is here, plus the shelf. Nothing when there is nothing to say. */
export function CatRoomStrip(props: {
  souvenirs: readonly CatShelfSouvenir[]
  isOwnCatAway: boolean
  hasGuest: boolean
  testID?: string
}) {
  const { souvenirs, isOwnCatAway, hasGuest, testID = "cat-room-strip" } = props
  const status = isOwnCatAway ? CAT_TRIP_COPY.awayChip : hasGuest ? CAT_TRIP_COPY.hostChip : null
  if (!status && souvenirs.length === 0) return null
  return (
    <View style={styles.strip} pointerEvents="box-none" testID={testID}>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <CatSouvenirShelf souvenirs={souvenirs} />
    </View>
  )
}
