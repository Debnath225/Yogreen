# YoGreen — customer app + backend (YGC rewards)

```
yogreen/
├── backend/   Node 22 API · REST + WebSocket · MongoDB persistence
└── mobile/    Expo / React Native customer app (TypeScript) · 15 core + contract tests
```

## Run it

**Backend** (Node ≥ 22):
```bash
cd backend && cp .env.example .env
npm install
# Set MONGODB_URI in .env to a MongoDB replica-set URI to use persistent storage.
npm test
npm run dev                    # http://localhost:4000  (OTP is printed in the server log and returned as devOtp in dev)
```
**Mobile app**:
```bash
cd mobile && npm install
npx expo install --fix         # aligns Expo-managed packages to the installed SDK
cp .env.example .env           # optional API URL and GOOGLE_MAPS_API_KEY
npx expo start                 # push notifications + SecureStore need a dev build / real device: npx expo run:android | run:ios
npm test                       # runs the mobile API client + realtime feed against the real backend
```
The backend must be running on port 4000 (`cd backend && npm run dev`). In Expo Go, the app reads the development host from the Expo manifest and connects to that computer on port 4000; keep the phone and computer on the same Wi-Fi network. If the host is unreachable, allow Node.js through the computer's firewall or set `EXPO_PUBLIC_API_URL` in `mobile/.env` to the computer's LAN address (for example `http://192.168.1.20:4000`). For an Android emulator outside Expo Go, use `http://10.0.2.2:4000`. Use an HTTPS backend URL for production. The development SMS provider logs the OTP in the backend console and returns it to the development app; configure an SMS webhook to deliver real SMS messages.
Customer carts, addresses, orders, and account data are stored through the backend; configure `MONGODB_URI` for persistence across backend restarts. Auth tokens remain only in the device's secure Keychain/Keystore (not AsyncStorage). The app does not read or write the legacy local cart.
Bootstrap admin: `SUPERADMIN_PHONE` in `.env` is created as `super_admin`. Log in with `client: "admin_app"`, then `POST /v1/admin/staff` to create riders/admins.

## Deploy the backend

Recommended starter setup: **Render Web Service + MongoDB Atlas**. Render supports this Node/Docker service and the app's realtime WebSocket endpoint; Atlas supplies the replica-set transactions required for checkout. A free Render web service is for testing only: it can spin down while idle, which interrupts realtime and delays requests. Choose a paid web-service instance for production.

1. Push this repository to GitHub and create an Atlas production cluster. Create a least-privilege database user and allow the Render service's outbound IPs in Atlas Network Access (or use Atlas's documented network option for your plan). Copy the Atlas SRV URI; do not commit it.
2. In Render, create a **Blueprint** from the repository root and select `render.yaml`. It sets **Root Directory** to `backend`. The repository root also has an npm lockfile and deployment scripts, so `npm ci --omit=dev` and `npm start` work if a manually configured service runs them from the repository root instead. For a manually configured web service, either set its **Root Directory** to `backend` and use those commands, or keep the repository root and use them there. If you already created a Docker service, set **Dockerfile Path** to `Dockerfile` and **Docker Context Directory** to `.`, both relative to the repository root; the root Dockerfile builds the backend from `backend/`.
3. Configure the Blueprint's unsynced environment variables in Render. Set `MONGODB_URI`, `OTP_SECRET` (generate with `openssl rand -base64 48`), matching `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` PEMs, `SMS_WEBHOOK_URL` (HTTPS) and `SMS_WEBHOOK_TOKEN`, and `SUPERADMIN_PHONE` in E.164 format. The SMS endpoint must accept an authenticated JSON `POST` with `{ "to": "<phone>", "message": "<text>" }`. Set `CORS_ORIGINS` in the Render dashboard to the exact browser origins if using the web client; it can be omitted for native mobile clients. Keep the generated JWT private key only in Render secrets.
4. Generate an RS256 pair locally and paste each PEM into its matching Render secret (never paste them in chat or commit them):

   ```sh
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
   openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
   ```

5. After deploy, confirm `https://<service>.onrender.com/health` returns `{"status":"ok",...}`. Set `EXPO_PUBLIC_API_URL=https://<service>.onrender.com` in both `mobile/.env` and `rider/.env`, then rebuild/restart the Expo apps. The clients derive their `wss://` realtime endpoint from this URL.

Production startup refuses missing/invalid database, JWT, OTP, or SMS configuration. Never use development OTP exposure, console SMS, or the in-memory store in production. Render's deployment configuration is in [`render.yaml`](./render.yaml); local secrets remain in ignored `.env` files.

## What's in the customer app
Welcome → Sign up / Login (mobile number only) → OTP (6-box input, SMS autofill, resend timer, shake on error) → 3-step Setup (profile, address, notifications + welcome bonus) → Main.
- **Bottom tabs:** Home · YGC · Cart · Orders · Profile.  **Top tabs:** Home categories (dynamic), Orders (Active/Past), YGC (How to earn/History).
- Stack screens: Checkout, Product detail, Order detail (animated timeline, live rider map, cancel), Notifications, Edit profile, Addresses, Help & FAQ, Privacy, Terms, About.
- Product cards and edge-to-edge product-detail images load real image URLs with emoji fallbacks; details include descriptions, storage guidance, availability, and product highlights. Address entry includes a map pin picker and optional current-location action.
- Both Expo apps use SDK 58-compatible `react-native-maps` and `expo-location`. Add a Google Maps key as `GOOGLE_MAPS_API_KEY` before building native maps (especially Android). Rider location is shared only while the rider app is open on an active delivery screen; background location is not requested.
- Custom animated popup system (`popup.show / confirm / alert`) + toasts; animated press, fade-ins, skeletons, count-up coins, live-price flash on cards.
- **YGC coins:** welcome bonus, daily check-in streak (IST day), 2% earn on delivered orders, redeem up to 10% per order, refunds on cancel, append-only ledger.
- Live prices over WebSocket (auto-reconnect, ETag-cached catalog), in-app + push notifications, account deletion.
- Text logo: **yo**green (`mobile/assets/logo.svg`, `<Logo/>` component). Brand/coin tunables live in `backend/src/config.js` (`ygc`, `delivery`).

## Backend design
- **Auth:** phone OTP (HMAC-hashed, 5-min TTL, 5 attempts, 30 s resend cooldown, 5/hour/number, constant-time compare) → RS256 JWT (15 min) + rotating refresh tokens with reuse detection; sessions revocable instantly. Login and signup intent are explicit; development OTPs are returned only when development exposure is enabled and auto-filled only in development builds.
- **Roles:** `customer`, `rider`, `admin`, `super_admin`. Customers have distinct login and signup flows. Riders can log in or submit an application with verified phone, name, vehicle details, and a PDF/JPG/PNG driving-license document (max 5 MB). New rider accounts stay `pending_approval` and receive no session until an admin approves them. Admin review APIs are `GET /v1/admin/riders/applications`, `GET /v1/admin/riders/:id/license`, and `PATCH /v1/admin/riders/:id/review` with `{ "decision": "approve" }` or `{ "decision": "reject", "note": "..." }`. These endpoints require an admin or super-admin token. This repository has no admin dashboard, so applications are reviewed through the protected API.
- **Structure:** route registration is split by domain under `backend/src/routes/`; shared validation/projection helpers live in `routes/shared.js`. MongoDB user queries are isolated in `db/repositories/users.js`, and rider application/document queries in `db/repositories/rider-applications.js`; services access persistence through the storage adapter.
- **Price control:** admin PATCH / bulk price + stock, versioned, audited, pushed live; changes above 30% need `super_admin`.
- **Orders:** server-side pricing only, idempotency keys, atomic stock + coin debit, strict status state machine, role-limited transitions, coins awarded exactly once. Live rider coordinates are available only to the order owner and are accepted only from the assigned rider during an active delivery.
- **Persistence:** MongoDB collections are isolated behind the storage adapter in `backend/src/db/mongo.js`; services and routes use async storage operations. Production requires `MONGODB_URI` and MongoDB is enabled by default. Development uses in-memory storage by default to avoid connecting to MongoDB; set `MONGODB_ENABLED=true` in `backend/.env` to opt in to persistent MongoDB storage.
- **Hardening:** security headers, CORS allow-list (HTTP + WS), body-size cap, JSON/validation with explicit field picking, per-IP + per-route rate limits, WS heartbeat/payload/connection caps, uniform errors without stack leaks, production config refuses insecure defaults.
- **Latency:** indexed point lookups and bounded sort/page reads, compound indexes aligned to filters, batched cart product reads, pre-serialized catalog with ETag/304, WS push instead of polling.

### MongoDB data model and index plan
Collections use stable string `id`/`userId` references and store only values needed by each read path:

| Collection | Shape / hot access pattern | Indexes |
|---|---|---|
| `users` | Profile, addresses, preferences, check-in state, rider application metadata; lookup by phone and authenticated user ID | unique `phone`, unique `id`, `(role,status)` |
| `riderDocuments` | Private license documents, retrievable only by authorized admin review routes | unique document `id`, unique `riderId` |
| `sessions`, `refreshTokens`, `otps` | Session validation, refresh rotation, OTP lookup | unique session ID, `(userId,revoked)`, unique refresh hash + expiry TTL, unique OTP phone + expiry TTL |
| `products`, `priceHistory` | Catalog snapshot and SKU lookup; per-product newest price changes | unique product ID/SKU, `(active,category,name)`, `(productId,at desc)` |
| `orders`, `idempotency` | Customer order history, staff status queue, replay-safe checkout | `(userId,createdAt desc)`, `(status,createdAt desc)`, permanent unique `(userId,key)` |
| `wallets`, `ledger` | O(1) current balance and newest-first bounded history | unique `userId`, `(userId,at desc,id desc)`, unique `(userId,type,refId)` when `refId` is set |
| `notifications`, `devices` | Per-user/broadcast inbox and push-token fan-out | `(audience,createdAt desc)`, 180-day TTL, unique `(userId,token)` |
| `audit` | Newest audit events per actor | `(at desc)`, `(actorId,at desc)` |

Checkout and order transitions use MongoDB transactions to commit stock, order, idempotency and wallet-ledger changes together; wallet debits use conditional balance updates. Therefore MongoDB must be a replica set (MongoDB Atlas works; a local single-node replica set also works). For local persistence, set `MONGODB_ENABLED=true`, then configure `MONGODB_URI` and optionally `MONGODB_DB` in `backend/.env`. In-memory development data is lost when the process restarts; production startup fails instead of silently running without MongoDB persistence.

## Honest limits — read before launch
1. **Multi-instance coordination:** MongoDB stores business and auth records. Rate limiting and WebSocket `Bus` broadcasts are still process-local; use shared Redis rate-limit state and a pub/sub adapter before horizontally scaling those features.
2. **SMS:** configure `SMS_PROVIDER=webhook` with your DLT-registered gateway (India). Production boot fails otherwise.
3. **Payments:** cash/UPI on delivery only. Online payment is shown as "coming soon".
4. **Legal text** (`mobile/src/content/legal.ts`) and support contacts (`mobile/src/config.ts`) are placeholders — get legal review.
5. **Mobile UI was not run on a device here** (no network to install React Native in my sandbox). What *was* verified: the mobile API client/token-refresh/realtime logic against the live backend, cart math, validators, and a project-wide type check. Expect to fix small version-specific issues on first `expo start`; run `npx expo install --fix` first. Dark mode and localisation are not included.
6. Push needs an EAS project id in `mobile/app.json` (`extra.eas.projectId`) and a real device.
#   Y o g r e e n  
 