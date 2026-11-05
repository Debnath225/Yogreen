const { expo } = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  ...expo,
  plugins: [
    ...(expo.plugins || []),
    ['expo-location', { locationWhenInUsePermission: 'Allow YoGreen Rider to share your location only during an active delivery while the app is open.' }],
    ['react-native-maps', {
      androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    }],
  ],
});
