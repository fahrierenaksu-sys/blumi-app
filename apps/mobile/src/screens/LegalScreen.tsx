import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { ReactNode } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { getAppLocale } from "../features/session/appLocale"
import { getLegalContent, type LegalContentType } from "../features/legal/legalCopy"
import { buildLegalDocumentLines } from "../features/legal/legalDocumentModel"

type LegalScreenProps = NativeStackScreenProps<RootStackParamList, "Legal">

function renderLegalBody(body: string): ReactNode[] {
  return buildLegalDocumentLines(body).map((line) => {
    if (line.kind === "spacer") {
      return <View key={line.key} style={styles.paragraphSpace} />
    }

    if (line.kind === "warning") {
      return (
        <View key={line.key} style={styles.warningBox}>
          <Ionicons accessibilityElementsHidden name="warning" size={18} color={uiTheme.colors.warningInk} />
          <Text selectable style={styles.warningText}>{line.text}</Text>
        </View>
      )
    }

    if (line.kind === "bullet") {
      return (
        <Text key={line.key} selectable style={styles.bulletText}>
          {`•  ${line.text}`}
        </Text>
      )
    }

    return (
      <Text
        key={line.key}
        accessibilityRole={line.accessibilityRole}
        selectable
        style={styles[line.kind]}
      >
        {line.text}
      </Text>
    )
  })
}

export function LegalScreen(props: LegalScreenProps) {
  const { navigation, route } = props
  const type = route.params.type
  const content = getLegalContent(
    getAppLocale(),
    type as LegalContentType
  )

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TopBar
          title={content.title}
          titleAlign="start"
          leftSlot={
            <ActionButtonCircle accessibilityLabel={getAppLocale() === "tr" ? "Geri dön" : "Go back"} onPress={() => navigation.goBack()} size={40}>
              <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
          }
        />
        <ScrollView
          accessibilityLabel={content.title}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {renderLegalBody(content.body)}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm
  },
  scroll: {
    paddingBottom: uiTheme.spacing.xxl
  },
  card: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    padding: uiTheme.spacing.lg,
    ...uiTheme.shadow.soft
  },
  "document-title": {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  metadata: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  paragraph: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    lineHeight: 22
  },
  bulletText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    lineHeight: 22,
    paddingLeft: uiTheme.spacing.xs,
    marginBottom: uiTheme.spacing.xxs
  },
  paragraphSpace: {
    height: uiTheme.spacing.md
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.sm,
    borderWidth: 1,
    borderColor: uiTheme.colors.warning,
    backgroundColor: uiTheme.colors.warningSoft,
    padding: uiTheme.spacing.sm
  },
  warningText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.warningInk,
    flex: 1
  },
  "section-heading": {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    lineHeight: 23
  }
})
