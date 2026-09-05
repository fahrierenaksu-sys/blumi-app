import { SafeAreaView, StyleSheet, Text } from "react-native"

/**
 * Production/preview resolver target. The real QA screen is never reachable
 * from a release-like Metro graph, even if a stale QA flag is present.
 */
export function HomeStudioScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Home Studio is not available in this build.</Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#4d1835", fontSize: 18, fontWeight: "700", textAlign: "center" }
})
