import type { PropsWithChildren } from "react"
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle
} from "react-native"
import {
  SafeAreaView,
  type Edge,
  type SafeAreaViewProps
} from "react-native-safe-area-context"
import { resolvePageContainerLayout } from "./pageContainerLayout"
import { useAppViewportMetrics } from "./useAppViewportMetrics"

const DEFAULT_EDGES: Edge[] = ["top", "right", "bottom", "left"]

export interface PageSafeAreaProps extends SafeAreaViewProps {
  contentGutter: boolean
  edges?: Edge[]
}

export function PageSafeArea({
  children,
  contentGutter,
  edges = DEFAULT_EDGES,
  style,
  ...props
}: PropsWithChildren<PageSafeAreaProps>) {
  const viewport = useAppViewportMetrics({ bottomNavVisible: false })
  const layout = resolvePageContainerLayout(viewport.safeWidth)

  return (
    <SafeAreaView
      {...props}
      edges={edges}
      style={[
        contentGutter && { paddingHorizontal: layout.horizontalInset },
        style
      ]}
    >
      {children}
    </SafeAreaView>
  )
}

export interface PageContentProps extends ViewProps {
  fullBleed?: boolean
  contentStyle?: StyleProp<ViewStyle>
}

export function PageContent({
  children,
  fullBleed = false,
  style,
  contentStyle,
  ...props
}: PropsWithChildren<PageContentProps>) {
  const viewport = useAppViewportMetrics({ bottomNavVisible: false })
  const layout = resolvePageContainerLayout(viewport.safeWidth)

  return (
    <View {...props} style={[styles.contentFrame, style]}>
      <View
        style={[
          styles.content,
          !fullBleed && {
            width: layout.contentWidth,
            maxWidth: layout.maxContentWidth
          },
          fullBleed && styles.fullBleed,
          contentStyle
        ]}
      >
        {children}
      </View>
    </View>
  )
}

export interface PageScrollContentProps extends ScrollViewProps {
  fullBleed?: boolean
  innerStyle?: StyleProp<ViewStyle>
}

export function PageScrollContent({
  children,
  fullBleed = false,
  contentContainerStyle,
  innerStyle,
  ...props
}: PropsWithChildren<PageScrollContentProps>) {
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
    >
      <PageContent fullBleed={fullBleed} contentStyle={innerStyle}>
        {children}
      </PageContent>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  contentFrame: {
    width: "100%",
    alignItems: "center"
  },
  content: {
    width: "100%"
  },
  fullBleed: {
    width: "100%",
    maxWidth: "100%"
  },
  scrollContent: {
    flexGrow: 1
  }
})
