const { withPodfile } = require("expo/config-plugins")
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode")

const TAG = "blumi-ios-dynamic-frameworks"

module.exports = function withIosDynamicFrameworks(config) {
  return withPodfile(config, (nextConfig) => {
    nextConfig.modResults.contents = mergeContents({
      src: nextConfig.modResults.contents,
      newSrc: "use_frameworks! :linkage => :dynamic",
      tag: TAG,
      anchor: /target ['\"]Blumi['\"] do/,
      offset: 1,
      comment: "#"
    }).contents
    return nextConfig
  })
}
