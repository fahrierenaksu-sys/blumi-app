import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { AVATAR_STUDIO_SECTIONS, type AvatarStudioSectionId } from "../wardrobeCategoryModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { getWardrobeSegmentIndicatorFrame } from "./wardrobeIndicatorModel"
import { WardrobeSlidingIndicator } from "./WardrobeSlidingIndicator"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

const TRACK_PADDING = 4

/**
 * Dolabım / Karakterim: a centred capsule whose dark plum half slides to the
 * selected section (WRD-3). Until the track is measured the selected button
 * draws its own background, so the first frame is already correct.
 */
export function WardrobeSectionSwitcher(props: {
  activeSection: AvatarStudioSectionId
  copy: WardrobeStudioCopy
  onSelectSection: (section: AvatarStudioSectionId) => void
}) {
  const { activeSection, copy, onSelectSection } = props
  const [trackWidth, setTrackWidth] = useState(0)
  const frame = getWardrobeSegmentIndicatorFrame({
    trackWidth,
    padding: TRACK_PADDING,
    count: AVATAR_STUDIO_SECTIONS.length,
    index: AVATAR_STUDIO_SECTIONS.findIndex((section) => section.id === activeSection)
  })
  return (
    <View
      accessibilityRole="tablist"
      style={styles.sectionSwitcher}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {frame ? (
        <WardrobeSlidingIndicator frame={frame} style={[styles.sectionButtonActive, styles.sectionIndicator]} />
      ) : null}
      {AVATAR_STUDIO_SECTIONS.map((section) => {
        const active = section.id === activeSection
        return (
          <Pressable
            key={section.id}
            testID={`avatar-studio-section-${section.id}`}
            accessibilityRole="tab"
            accessibilityLabel={copy[section.id]}
            accessibilityState={{ selected: active }}
            onPress={() => onSelectSection(section.id)}
            style={[
              styles.sectionButton,
              active && !frame ? styles.sectionButtonActive : null
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[
                styles.sectionButtonText,
                active ? styles.sectionButtonTextActive : null
              ]}
            >
              {copy[section.id]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
