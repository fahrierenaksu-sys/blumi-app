/**
 * Release decision for the authored onboarding motion set. The motion remains
 * gated in every other case, so a future candidate cannot reach production
 * without another explicit promotion here.
 */
export const ONBOARDING_ASSET_PRODUCTION_PROMOTION = Object.freeze({
  run: true,
  welcomeHome: true,
  profileCharacterReaction: true
})
