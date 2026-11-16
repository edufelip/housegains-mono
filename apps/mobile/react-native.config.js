// @react-native-firebase/remote-config lists @react-native-firebase/analytics as a peer dependency,
// so Bun installs it, and autolinking would add Firebase Analytics to both apps. HouseGains does not use
// Analytics (Remote Config works without it), so keep it out of the native builds.
module.exports = {
  dependencies: {
    '@react-native-firebase/analytics': {
      platforms: { android: null, ios: null },
    },
  },
};
