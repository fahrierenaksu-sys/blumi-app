import { useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, View } from "react-native"
import { LinearGradient } from "./linearGradient"
import { uiTheme } from "./theme"

interface TypingIndicatorProps {
  visible: boolean
}

/**
 * Three-dot bouncing animation to indicate partner is typing.
 * Mount with `visible={true}` when you receive a server typing signal.
 */
export function TypingIndicator(props: TypingIndicatorProps) {
  const { visible } = props
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current
  const entranceAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) {
      dot1.setValue(0)
      dot2.setValue(0)
      dot3.setValue(0)
      Animated.timing(entranceAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.spring(entranceAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()

    const createDotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 350,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.delay(600 - delay)
        ])
      )

    const anim = Animated.parallel([
      createDotAnimation(dot1, 0),
      createDotAnimation(dot2, 180),
      createDotAnimation(dot3, 360)
    ])

    anim.start()
    return () => anim.stop()
  }, [dot1, dot2, dot3, entranceAnim, visible])

  if (!visible) return null

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bubbleWrap,
          {
            opacity: entranceAnim,
            transform: [
              {
                scale: entranceAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                })
              }
            ],
          }
        ]}
      >
        <LinearGradient
          colors={[uiTheme.colors.surface, uiTheme.colors.surfaceSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bubble}
        >
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  opacity: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.25, 1]
                  }),
                  transform: [
                    {
                      translateY: dot.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -5]
                      })
                    },
                    {
                      scale: dot.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1, 1.25, 1],
                      })
                    }
                  ]
                }
              ]}
            />
          ))}
        </LinearGradient>
        <View style={styles.bubbleTail} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.xs,
    alignItems: "flex-start"
  },
  bubbleWrap: {
    position: "relative",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    ...uiTheme.shadow.soft,
  },
  bubbleTail: {
    position: "absolute",
    bottom: -4,
    left: 14,
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: uiTheme.colors.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: uiTheme.colors.border,
    transform: [{ rotate: "45deg" }],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: uiTheme.colors.primary,
  }
})
