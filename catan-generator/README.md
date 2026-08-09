# Hex Settlement Coach

Setup coach for hex settlement boards (base + 5–6 player extension): generate boards, rank opening settlements/roads, photo import, and midgame tips.

> **App Store name:** Hex Settlement Coach  
> Do not use trademarked “Catan” branding in store listings without a license. See [docs/PRODUCT.md](docs/PRODUCT.md).

## Live (web demo)

After merge to `main`, GitHub Pages:

**https://rubixre.github.io/grouper/**

## Get started

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

Language defaults to **English**; switch to Norwegian in **Settings**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production web build |
| `npm run preview` | Preview production build |
| `npm run test:logic` | Board / scoring smoke tests |
| `npm run build:ios` | Web build + Capacitor sync (needs `ios/` from a Mac) |
| `npm run cap:add:ios` | Create Xcode project once (Mac + Xcode) |
| `npm run cap:open:ios` | Open Xcode |

## Premium (phase 1 — local gate)

- **Free:** unlimited standard board generation  
- **Premium:** Bonanza, setup simulation, midgame advice  

Dev-only unlock: **Try Premium** → development activate, or `?premium=1` (not in production builds).

Subscriptions: RevenueCat + StoreKit — see [docs/ios-release.md](docs/ios-release.md).

## iOS / App Store (no Mac required)

**Codemagic CI:** [docs/CODEMAGIC.md](docs/CODEMAGIC.md) — builds on cloud Macs → TestFlight  
Config: [`codemagic.yaml`](../codemagic.yaml) at repo root  

Also: [docs/ios-release.md](docs/ios-release.md) · [docs/PRODUCT.md](docs/PRODUCT.md) · [public/privacy.html](public/privacy.html)

## Feedback

In the app: **Settings → Send feedback**.  
GitHub: use the bug / feature issue templates under `.github/ISSUE_TEMPLATE/`.
