import React from "react"
import { StyleSheet, View, type ViewStyle } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { LinearGradient } from "./linearGradient"

export type AvatarFrameVariant = "rose-quartz" | "pearl-aura" | "champagne-gold"

interface AvatarFrameProps {
  variant: AvatarFrameVariant
  children: React.ReactNode
  style?: ViewStyle
}

export function AvatarFrame({ variant, children, style }: AvatarFrameProps) {
  if (variant === "rose-quartz") {
    return (
      <View style={[styles.container, styles.shadowSoftPink, style]}>
        <LinearGradient
          colors={["#FFE4E1", "#FFB6C1", "#FFC0CB", "#FFE4E1"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.borderGradient}
        />
        <View style={styles.innerGlass}>
          <LinearGradient
            colors={["rgba(255, 182, 193, 0.15)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
        <View style={styles.badgeBottomRight}>
          <View style={styles.badgeGlass}>
            <Ionicons name="heart" size={16} color="#FF69B4" />
          </View>
        </View>
      </View>
    )
  }

  if (variant === "pearl-aura") {
    return (
      <View style={[styles.container, styles.shadowSoftWhite, style]}>
        <LinearGradient
          colors={["#FFFFFF", "#F8F9FA", "#E9ECEF", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.borderGradient}
        />
        <View style={styles.innerGlass}>
          <LinearGradient
            colors={["rgba(255, 255, 255, 0.4)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
        <View style={styles.badgeTopLeft}>
          <View style={styles.badgeGlass}>
            <Ionicons name="sparkles" size={16} color="#ADB5BD" />
          </View>
        </View>
      </View>
    )
  }

  if (variant === "champagne-gold") {
    return (
      <View style={[styles.container, styles.shadowSoftGold, style]}>
        <LinearGradient
          colors={["#FFF8DC", "#FCE694", "#EEDC82", "#FFF8DC"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.borderGradient}
        />
        <View style={styles.innerGlass}>
          <LinearGradient
            colors={["rgba(252, 230, 148, 0.15)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
        <View style={styles.badgeBottomCenter}>
          <View style={styles.badgeGlass}>
            <Ionicons name="star" size={16} color="#DAA520" />
          </View>
        </View>
      </View>
    )
  }

  return <View style={style}>{children}</View>
}

const styles = StyleSheet.create({
  container: {
    padding: 5, // Thick soft border
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  borderGradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
  },
  innerGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.7)", // Frosted glass effect
    borderRadius: 20,
    overflow: "hidden",
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)", // Glass highlight
  },

  // Soft Shadows (matching app aesthetic)
  shadowSoftPink: {
    shadowColor: "#FFB6C1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  shadowSoftWhite: {
    shadowColor: "#CED4DA",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  shadowSoftGold: {
    shadowColor: "#DAA520",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },

  // Elegant Badges
  badgeGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  badgeBottomRight: {
    position: "absolute",
    bottom: -10,
    right: -10,
  },
  badgeTopLeft: {
    position: "absolute",
    top: -10,
    left: -10,
  },
  badgeBottomCenter: {
    position: "absolute",
    bottom: -12,
  },
})
