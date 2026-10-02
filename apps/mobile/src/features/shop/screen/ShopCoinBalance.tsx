import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, Text, TextInput, View } from "react-native"
import Animated from "react-native-reanimated"
import type { AppLocale } from "../../session/appLocale"
import { shopScreenStyles } from "./shopScreenStyles"
import { useShopCoinBalanceMotion } from "./useShopCoinBalanceMotion"

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)
const COIN_ICON_COLOR = "#B9820D"
const COIN_ICON_SIZE = 14

type ShopCoinBalanceProps = {
  coins: number
  verified: boolean
  locale: AppLocale
}

/**
 * Icon and balance inside the Shop coin pill. The pill owns the accessible
 * label (the confirmed target), so this content is hidden from assistive tech
 * and never announces intermediate counts.
 */
export function ShopCoinBalance({ coins, verified, locale }: ShopCoinBalanceProps) {
  const motion = useShopCoinBalanceMotion({ coins, verified, locale })
  return (
    <View
      style={styles.content}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={motion.iconStyle}>
        <Ionicons name="diamond" size={COIN_ICON_SIZE} color={COIN_ICON_COLOR} />
      </Animated.View>
      <View>
        <Text style={[shopScreenStyles.coinText, styles.sizer]}>{motion.layoutText}</Text>
        <AnimatedTextInput
          editable={false}
          caretHidden
          contextMenuHidden
          scrollEnabled={false}
          underlineColorAndroid="transparent"
          defaultValue={motion.restingText}
          animatedProps={motion.textProps}
          style={[shopScreenStyles.coinText, styles.value]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    pointerEvents: "none"
  },
  sizer: {
    opacity: 0
  },
  value: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    margin: 0,
    padding: 0,
    textAlign: "left",
    textAlignVertical: "center"
  }
})
