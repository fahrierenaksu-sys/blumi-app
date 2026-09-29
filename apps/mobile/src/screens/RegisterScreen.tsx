import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import type { RegisterAccountInput } from "../features/session/sessionApi"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getAuthEntryCopy } from "../features/session/authEntryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { RegisterCharacterHero } from "./RegisterCharacterHero"
import { useEntranceAnimation, useSelectionTransition } from "../ui/animations"
import { RegisterCreateView } from "../features/session/register/RegisterCreateView"
import { RegisterSignInView } from "../features/session/register/RegisterSignInView"
import { resolveSignInHeroCopy } from "../features/session/register/registerScreenModel"
import { useRegisterFlowController } from "../features/session/register/useRegisterFlowController"
import { useRegisterLayout } from "../features/session/register/useRegisterLayout"
import type { UserAvatar } from "../features/avatarV2/avatarV2.types"

type RegisterScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "Register"
> & {
  isSubmitting: boolean
  errorMessage: string | null
  onRequestVerificationCode: (input: { phoneNumber: string }) => Promise<void>
  onRegister: (input: RegisterAccountInput) => Promise<void>
  onClearError: () => void
  onCreateFlowStageChange?: (stage: "phone" | "otp") => void
  createFlowAvatar?: Partial<UserAvatar> | null
  motionActive?: boolean
}

/**
 * Phone registration and sign-in. The flow state machine lives in
 * useRegisterFlowController; the create intent renders inside the shared
 * setup shell and the sign-in intent renders its own scroll page.
 */
export function RegisterScreen({
  route,
  navigation,
  isSubmitting,
  errorMessage,
  onRequestVerificationCode,
  onRegister,
  onClearError,
  onCreateFlowStageChange,
  createFlowAvatar,
  motionActive = true
}: RegisterScreenProps) {
  const authIntent = route.params?.intent ?? "create"
  const cameFromWorld = route.params?.entryMotion === "world-handoff"
  const locale = resolveAccountRecoveryLocale(
    getNativeAppLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale
  )
  const authCopy = getAuthEntryCopy(locale)
  const layout = useRegisterLayout()
  const register = useRegisterFlowController({
    authIntent,
    locale,
    authCopy,
    isSubmitting,
    errorMessage,
    onRequestVerificationCode,
    onRegister,
    onClearError,
    onCreateFlowStageChange
  })
  const { flow } = register
  const formTransition = useSelectionTransition(flow.stage, {
    fromScale: 0.992,
    translateY: 8
  })
  const handoffEntrance = useEntranceAnimation({
    duration: cameFromWorld ? 260 : 0,
    translateY: cameFromWorld ? 22 : 0
  })
  const leaveRegister = (): void => {
    onClearError()
    goBackOrFallback(navigation, () => navigation.replace("AuthEntry"))
  }
  const openPrivacy = (): void => navigation.navigate("Legal", { type: "privacy" })
  const openTerms = (): void => navigation.navigate("Legal", { type: "terms" })

  if (authIntent === "create") {
    return (
      <RegisterCreateView
        authCopy={authCopy}
        locale={locale}
        register={register}
        layout={layout}
        errorMessage={errorMessage}
        motionActive={motionActive}
        formTransition={formTransition}
        handoffEntrance={handoffEntrance}
        onLeave={leaveRegister}
        onOpenPrivacy={openPrivacy}
        onOpenTerms={openTerms}
      />
    )
  }

  const signInHeroCopy = resolveSignInHeroCopy({
    authIntent,
    isCodeStep: register.isCodeStep,
    codeRequestStatus: register.codeRequestStatus,
    authCopy
  })
  return (
    <RegisterSignInView
      authIntent={authIntent}
      authCopy={authCopy}
      locale={locale}
      register={register}
      layout={layout}
      errorMessage={errorMessage}
      motionActive={motionActive}
      createFlowAvatar={createFlowAvatar}
      characterHero={authIntent === "sign-in" ? (
        <RegisterCharacterHero
          compact={layout.compactHero}
          body={signInHeroCopy.body}
          message={authCopy.registerHeroMessage}
          title={signInHeroCopy.title}
        />
      ) : null}
      formTransition={formTransition}
      handoffEntrance={handoffEntrance}
      onLeave={leaveRegister}
      onOpenPrivacy={openPrivacy}
      onOpenTerms={openTerms}
    />
  )
}
