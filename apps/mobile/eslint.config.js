// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', 'scripts/**', 'ios/**', 'android/**'],
  },
  {
    rules: {
      // Expo SDK 57 enables React Compiler diagnostics through eslint-config-expo.
      // The current React Native animation layer deliberately owns Animated.Values
      // in refs; migrating every animation primitive is a separate behavior change.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },
]);
