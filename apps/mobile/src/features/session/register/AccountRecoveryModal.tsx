import { useEffect } from "react"
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native"
import { hapticError } from "../../../ui/haptics"
import { AppKeyboardAvoidingView } from "../../../ui/keyboard"
import type { AccountRecoveryCopy } from "../accountRecoveryCopy"
import {
  resolveRecoveryPrimaryControl,
  sanitizeRecoveryCode
} from "./registerScreenModel"
import { registerStyles as styles } from "./registerStyles"
import type { AccountRecoveryFlow } from "./useAccountRecoveryFlow"

/** Keyboard-safe, scrollable account recovery sheet for sign-in. */
export function AccountRecoveryModal({
  recovery,
  recoveryCopy,
  stackRecoveryActions
}: {
  recovery: AccountRecoveryFlow
  recoveryCopy: AccountRecoveryCopy
  stackRecoveryActions: boolean
}) {
  const {
    recoveryVisible,
    recoveryStage,
    recoveryOldPhone,
    recoveryNewPhone,
    recoveryCode,
    recoveryBusy,
    recoveryError,
    setRecoveryOldPhone,
    setRecoveryNewPhone,
    setRecoveryCode,
    requestRecoveryCode,
    submitRecovery,
    closeRecovery
  } = recovery
  const recoveryPrimary = resolveRecoveryPrimaryControl({
    recoveryBusy,
    recoveryStage,
    recoveryOldPhone,
    recoveryNewPhone,
    recoveryCode,
    recoveryCopy
  })
  // A rejected step answers physically, not only in red text (ONB-18).
  useEffect(() => {
    if (recoveryError) hapticError()
  }, [recoveryError])
  return (
    <Modal visible={recoveryVisible} transparent animationType="fade" onRequestClose={closeRecovery}>
      <View style={styles.recoveryBackdrop}>
        <AppKeyboardAvoidingView
          keyboardVerticalOffset={12}
          style={styles.recoveryKeyboard}
        >
          <ScrollView
            contentContainerStyle={styles.recoveryScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.recoveryCard}>
              <Text accessibilityRole="header" style={styles.recoveryTitle}>{recoveryCopy.title}</Text>
              <Text style={styles.recoveryBody}>
                {recoveryStage === "details"
                  ? recoveryCopy.detailsBody
                  : recoveryCopy.codeBody}
              </Text>
              {recoveryStage === "details" ? <>
                <TextInput accessibilityLabel={recoveryCopy.oldPhoneLabel} autoComplete="tel" autoFocus keyboardType="phone-pad" placeholder={recoveryCopy.oldPhonePlaceholder} value={recoveryOldPhone} onChangeText={setRecoveryOldPhone} style={styles.recoveryInput} />
                <TextInput accessibilityLabel={recoveryCopy.newPhoneLabel} autoComplete="tel" keyboardType="phone-pad" placeholder={recoveryCopy.newPhonePlaceholder} value={recoveryNewPhone} onChangeText={setRecoveryNewPhone} style={styles.recoveryInput} />
              </> : <TextInput accessibilityLabel={recoveryCopy.codeLabel} autoComplete="one-time-code" autoFocus textContentType="oneTimeCode" keyboardType="number-pad" maxLength={6} placeholder={recoveryCopy.codePlaceholder} value={recoveryCode} onChangeText={(value) => setRecoveryCode(sanitizeRecoveryCode(value))} style={styles.recoveryInput} />}
              {recoveryError ? <Text accessibilityRole="alert" style={styles.recoveryError}>{recoveryError}</Text> : null}
              <View style={[styles.recoveryActions, stackRecoveryActions ? styles.recoveryActionsStacked : null]}>
                <Pressable accessibilityRole="button" accessibilityLabel={recoveryCopy.cancel} disabled={recoveryBusy} onPress={closeRecovery} style={({ pressed }) => [styles.recoverySecondary, stackRecoveryActions ? styles.recoveryActionStacked : null, pressed ? styles.controlPressed : null]}><Text style={styles.recoverySecondaryText}>{recoveryCopy.cancel}</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={recoveryPrimary.label} disabled={recoveryPrimary.disabled} onPress={() => void (recoveryStage === "details" ? requestRecoveryCode() : submitRecovery())} style={({ pressed }) => [styles.recoveryPrimary, stackRecoveryActions ? styles.recoveryActionStacked : null, pressed && !recoveryPrimary.disabled ? styles.controlPressed : null]}><Text style={styles.recoveryPrimaryText}>{recoveryPrimary.label}</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        </AppKeyboardAvoidingView>
      </View>
    </Modal>
  )
}
