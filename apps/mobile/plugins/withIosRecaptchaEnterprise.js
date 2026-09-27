const { withPodfile } = require("expo/config-plugins")
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode")

const TAG = "blumi-ios-recaptcha-enterprise"

module.exports = function withIosRecaptchaEnterprise(config) {
  return withPodfile(config, (nextConfig) => {
    // Keep an existing local Podfile entry intact; clean prebuilds get the tagged entry below.
    if (nextConfig.modResults.contents.includes("pod 'RecaptchaEnterprise', '18.9.1'")) {
      return nextConfig
    }
    nextConfig.modResults.contents = mergeContents({
      src: nextConfig.modResults.contents,
      newSrc: "  pod 'RecaptchaEnterprise', '18.9.1'",
      tag: TAG,
      anchor: /target ['\"]Blumi['\"] do/,
      offset: 1,
      comment: "#"
    }).contents
    return nextConfig
  })
}
