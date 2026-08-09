# iOS / App Store release checklist

Product identity: see [PRODUCT.md](./PRODUCT.md).

## Prerequisites (you)

1. Apple Developer Program membership
2. Mac with Xcode 15+
3. App record in App Store Connect (`com.hexsettlement.coach`)
4. Privacy URL (hosted `privacy.html`) + support email
5. App icon 1024×1024 (generic hex island — no trademarked settlers art)

## Generate the native iOS project (Mac)

From `catan-generator/`:

```bash
npm install
npm run build
npx cap add ios          # once
npm run build:ios        # vite build + cap sync
npx cap open ios
```

In Xcode:

1. Select the **App** target → Signing & Capabilities → your Team
2. Confirm Bundle Identifier `com.hexsettlement.coach`
3. Deployment target iOS 15.0+
4. Add camera / photo library usage strings if photo import uses device camera:
   - `NSCameraUsageDescription`
   - `NSPhotoLibraryUsageDescription`
5. Product → Archive → Distribute App → TestFlight / App Store

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Web / GitHub Pages (`GITHUB_PAGES=true` in CI) |
| `npm run build:ios` | Production web assets + `cap sync ios` |
| `npm run cap:sync` | Sync only |
| `npm run cap:open:ios` | Open Xcode |

Vite `base` is `/` unless `GITHUB_PAGES=true` (required for Capacitor).

## TestFlight (M3)

- [ ] English UI default; Norwegian selectable in Settings
- [ ] No “Activate Premium (development)” in Release builds
- [ ] Screenshots: iPhone 6.7" and 6.1"
- [ ] Privacy nutrition labels (v1.0: on-device only)
- [ ] Review notes: setup coach for hex settlement boards — not a full digital board game; no trademarked brand names
- [ ] Internal TestFlight → external → Submit for Review

## Subscriptions (M4)

1. App Store Connect → Subscriptions (monthly + yearly, 14-day intro)
2. RevenueCat project + iOS API key
3. Set `VITE_REVENUECAT_IOS_KEY` in the iOS build env
4. `npm i @revenuecat/purchases-capacitor` and implement `loadPurchasesPlugin()` in `src/catan/purchases.ts`
5. Map entitlement id `premium` to Bonanza / simulation / midgame

## Feedback loop (M5)

- In-app: Settings → Send feedback (mailto)
- Optional: `VITE_SENTRY_DSN` + `@sentry/react`
- GitHub Issues labels: `bug`, `ux`, `variant`, `premium`
- Cadence: biweekly patch, monthly feature

## Variants (M6)

Shipped: `base`, `extension56` via `src/catan/variants.ts`.  
Upcoming stubs: `seafarersLite`, `citiesLite` (not playable until implemented).
