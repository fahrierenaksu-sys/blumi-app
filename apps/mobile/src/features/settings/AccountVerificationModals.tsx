import { Modal, Text, TextInput, View } from "react-native"
import { CountryCallingCodePicker } from "../../components/CountryCallingCodePicker"
import { getLocalPhonePlaceholder } from "../session/registerPresentationModel"
import type { SettingsCopy } from "./settingsCopy"
import { settingsStyles as styles } from "./settingsStyles"
import { getPhoneChangeStepPresentation } from "./settingsPhoneChangeModel"
import { isVerificationCodeComplete } from "./settingsPresentationModel"
import type { useAccountDataExport } from "./useAccountDataExport"
import type { useAccountDeletion } from "./useAccountDeletion"
import type { usePhoneChange } from "./usePhoneChange"
import { PressableScale } from "../../ui/PressableScale"

export function AccountDataExportModal(props: {
  copy: SettingsCopy
  dataExport: ReturnType<typeof useAccountDataExport>
}) {
  const { copy } = props
  const { changeExportCode, closeExportCode, exportCode, exportCodeVisible, isExportingAccountData, verifyExportCode } = props.dataExport

  return (
    <Modal
      visible={exportCodeVisible}
      transparent
      animationType="fade"
      onRequestClose={closeExportCode}
    >
      <View style={styles.deletionModalBackdrop}>
        <View style={styles.deletionModalCard}>
          <Text style={styles.deletionModalTitle}>{copy.exportTitle}</Text>
          <Text style={styles.deletionModalBody}>
            {copy.exportBody}
          </Text>
          <TextInput
            accessibilityLabel={copy.exportCode}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={changeExportCode}
            placeholder="000000"
            style={styles.deletionCodeInput}
            value={exportCode}
          />
          <View style={styles.deletionModalActions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={copy.cancelExport}
              onPress={closeExportCode}
              style={styles.deletionSecondaryButton}
            >
              <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={copy.verifyExport}
              disabled={!isVerificationCodeComplete(exportCode) || isExportingAccountData}
              onPress={() => void verifyExportCode()}
              style={[styles.deletionPrimaryButton, !isVerificationCodeComplete(exportCode) || isExportingAccountData ? styles.deletionButtonDisabled : null]}
            >
              <Text style={styles.deletionPrimaryText}>{isExportingAccountData ? copy.preparing : copy.continue}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function PhoneChangeModal(props: {
  copy: SettingsCopy
  phoneChange: ReturnType<typeof usePhoneChange>
}) {
  const { copy } = props
  const {
    changeNewPhoneNumber,
    changePhoneChangeCode,
    currentPhoneCode,
    isChangingPhone,
    isPrimaryDisabled,
    newPhoneCode,
    newPhoneCountry,
    newPhoneNumber,
    phoneChangeStep,
    phoneChangeVisible,
    requestPhoneChangeNewCode,
    resetPhoneChangeFlow,
    selectNewPhoneCountry,
    verifyCurrentPhoneChangeCode,
    verifyNewPhoneChangeCode
  } = props.phoneChange
  const presentation = getPhoneChangeStepPresentation(phoneChangeStep, isChangingPhone, copy)

  return (
    <Modal
      visible={phoneChangeVisible}
      transparent
      animationType="fade"
      onRequestClose={resetPhoneChangeFlow}
    >
      <View style={styles.deletionModalBackdrop}>
        <View style={styles.deletionModalCard}>
          <Text style={styles.deletionModalTitle}>
            {presentation.title}
          </Text>
          <Text style={styles.deletionModalBody}>
            {presentation.body}
          </Text>
          {phoneChangeStep === "new_number" ? (
            <View style={styles.phoneChangeControl}>
              <CountryCallingCodePicker
                disabled={isChangingPhone}
                selectedCountry={newPhoneCountry}
                onSelect={selectNewPhoneCountry}
              />
              <View style={styles.phoneChangeDivider} />
              <TextInput
                accessibilityLabel={copy.newPhoneInput}
                autoCapitalize="none"
                autoComplete="tel"
                autoCorrect={false}
                editable={!isChangingPhone}
                keyboardType="phone-pad"
                maxLength={24}
                onChangeText={changeNewPhoneNumber}
                placeholder={getLocalPhonePlaceholder(newPhoneCountry, copy.localPhonePlaceholder)}
                style={styles.phoneChangeInput}
                textContentType="telephoneNumber"
                value={newPhoneNumber}
              />
            </View>
          ) : (
            <TextInput
              accessibilityLabel={presentation.codeInputAccessibilityLabel}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={changePhoneChangeCode}
              placeholder="000000"
              style={styles.deletionCodeInput}
              value={phoneChangeStep === "current_code" ? currentPhoneCode : newPhoneCode}
            />
          )}
          <View style={styles.deletionModalActions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={copy.cancelPhoneChange}
              onPress={resetPhoneChangeFlow}
              style={styles.deletionSecondaryButton}
            >
              <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={presentation.primaryAccessibilityLabel}
              disabled={isPrimaryDisabled}
              onPress={() => {
                if (phoneChangeStep === "current_code") {
                  void verifyCurrentPhoneChangeCode()
                  return
                }
                if (phoneChangeStep === "new_number") {
                  void requestPhoneChangeNewCode()
                  return
                }
                void verifyNewPhoneChangeCode()
              }}
              style={[
                styles.deletionPrimaryButton,
                isPrimaryDisabled
                  ? styles.deletionButtonDisabled
                  : null
              ]}
            >
              <Text style={styles.deletionPrimaryText}>
                {presentation.primaryText}
              </Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function AccountDeletionModal(props: {
  copy: SettingsCopy
  deletion: ReturnType<typeof useAccountDeletion>
}) {
  const { copy } = props
  const { changeDeletionCode, closeDeletionCode, deletionCode, deletionCodeVisible, isDeletingAccount, verifyDeletionCode } = props.deletion

  return (
    <Modal
      visible={deletionCodeVisible}
      transparent
      animationType="fade"
      onRequestClose={closeDeletionCode}
    >
      <View style={styles.deletionModalBackdrop}>
        <View style={styles.deletionModalCard}>
          <Text style={styles.deletionModalTitle}>{copy.deletionCodeTitle}</Text>
          <Text style={styles.deletionModalBody}>
            {copy.deletionCodeBody}
          </Text>
          <TextInput
            accessibilityLabel={copy.deletionCode}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={changeDeletionCode}
            placeholder="000000"
            style={styles.deletionCodeInput}
            value={deletionCode}
          />
          <View style={styles.deletionModalActions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={copy.cancelDeletion}
              onPress={closeDeletionCode}
              style={styles.deletionSecondaryButton}
            >
              <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={copy.verifyDeletion}
              disabled={!isVerificationCodeComplete(deletionCode) || isDeletingAccount}
              onPress={() => void verifyDeletionCode()}
              style={[styles.deletionPrimaryButton, !isVerificationCodeComplete(deletionCode) || isDeletingAccount ? styles.deletionButtonDisabled : null]}
            >
              <Text style={styles.deletionPrimaryText}>{isDeletingAccount ? copy.checking : copy.continue}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  )
}
