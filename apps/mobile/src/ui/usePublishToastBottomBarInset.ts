import { NavigationContext } from "@react-navigation/native"
import { useContext, useEffect } from "react"
import { publishToastBottomBarInset } from "./toastLayoutStore"

/**
 * Publishes where the bottom bar ends so the global toast sits above it.
 * Inside a screen (the main-page pager slot) the bar counts only while that
 * screen is focused: a pushed detail route covers it and clears the inset on
 * blur. Outside a screen (the root overlay) the `visible` prop decides.
 * Event based (focus, blur, layout change), never per frame.
 */
export function usePublishToastBottomBarInset(inset: number, visible: boolean): void {
  const navigation = useContext(NavigationContext)

  useEffect(() => {
    if (!visible) return undefined
    const owner = Symbol("bottomBar")
    const publish = (): void => publishToastBottomBarInset(owner, inset)
    const clear = (): void => publishToastBottomBarInset(owner, null)
    if (!navigation) {
      publish()
      return clear
    }
    if (navigation.isFocused()) publish()
    const removeFocus = navigation.addListener("focus", publish)
    const removeBlur = navigation.addListener("blur", clear)
    return () => {
      removeFocus()
      removeBlur()
      clear()
    }
  }, [inset, navigation, visible])
}
