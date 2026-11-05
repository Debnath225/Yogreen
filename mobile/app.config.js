const { expo } = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  ...expo,
  plugins: [
    ...(expo.plugins || []),
    ['expo-location', { locationWhenInUsePermission: 'Allow YoGreen to use your location for delivery addresses.' }],
    ['react-native-maps', {
      androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    }],
  ],
});
