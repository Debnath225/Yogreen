# YoGreen Rider (Expo / React Native)

```bash
npm install && npx expo install --fix
cp .env.example .env      # optional API URL and GOOGLE_MAPS_API_KEY; Expo development auto-detects the host
npx expo start            # push + SecureStore need a dev build / real device
npm test                  # RiderApi + live channel against the real ../backend
```
The backend must be running on port 4000 (`cd ../backend && npm run dev`). In Expo Go, the rider app reads the Expo development host from the active manifest and connects to that computer on port 4000; keep the phone and computer on the same Wi-Fi network. If the host is unreachable, allow Node.js through the computer's firewall or set `EXPO_PUBLIC_API_URL` in `.env` to the computer's LAN address (for example `http://192.168.1.20:4000`). For an Android emulator outside Expo Go, use `http://10.0.2.2:4000`. Use an HTTPS backend URL in production.
Riders are created by an admin (`POST /v1/admin/staff`). See the root README for behaviour and limits.
Riders can log in by OTP or apply from the rider login screen with their name, phone, vehicle details, and a PDF/JPG/PNG driving-license document (maximum 5 MB). OTPs are auto-filled in development builds. Applications cannot access rider features until approved by an admin.

Admins review applications through the protected backend endpoints `GET /v1/admin/riders/applications`, `GET /v1/admin/riders/:id/license`, and `PATCH /v1/admin/riders/:id/review`. This repository currently has no admin dashboard. The rider backend API also supports online status, dispatch/claim, pickup and delivery PIN verification, earnings, cash settlement, realtime order events, and push alerts. `react-native-maps` and `expo-location` support active-delivery maps and foreground-only location sharing while the rider app is open. Set `GOOGLE_MAPS_API_KEY` for native map builds.
