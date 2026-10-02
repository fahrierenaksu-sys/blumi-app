module.exports = function (api) {
  api.cache(true)
  // babel-preset-expo adds react-native-worklets/plugin itself when the
  // package is installed (build/configs/expo.js), so it is not listed here.
  return {
    presets: [require.resolve("babel-preset-expo")]
  }
}
