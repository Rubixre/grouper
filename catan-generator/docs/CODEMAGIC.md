# Codemagic uten lokal Mac

Denne guiden får **Hex Settlement Coach** bygget på Codemagic Mac-maskiner og lastet opp til **TestFlight**. Du trenger PC + Apple Developer-konto — ikke egen Mac.

## Oversikt

```text
GitHub push → Codemagic Mac → npm build + cap sync → signert IPA → TestFlight
```

Konfigurasjon: [`codemagic.yaml`](../../codemagic.yaml) i repo-roten.

---

## Steg 1 — Apple Developer + App Store Connect

Gjør dette fra hvilken som helst PC:

1. Meld deg inn i [Apple Developer Program](https://developer.apple.com/programs/) ($99/år) hvis du ikke allerede er medlem.
2. Gå til [App Store Connect](https://appstoreconnect.apple.com/) → **My Apps** → **+** → New App:
   - Platform: iOS  
   - Name: `Hex Settlement Coach`  
   - Bundle ID: registrer `com.hexsettlement.coach` under Certificates, Identifiers & Profiles hvis den mangler  
   - SKU: f.eks. `hex-settlement-coach`  
3. Noter **Apple ID** (numerisk) under App Information — brukes som `APP_STORE_APPLE_ID`.

### Lag App Store Connect API-nøkkel

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+** Generate API Key  
   - Name: `Codemagic HexSettlementCoach`  
   - Access: **App Manager** (anbefalt)
3. Last ned `.p8`-filen (kun én gang)
4. Noter **Issuer ID** og **Key ID**

---

## Steg 2 — Codemagic-konto og repo

1. Opprett konto på [codemagic.io](https://codemagic.io) (logg inn med GitHub).
2. **Add application** → velg repo `Rubixre/grouper`.
3. Når du får **"The repository doesn't seem to contain a mobile application"**:
   - Det er forventet. Repoet er en monorepo; iOS ligger under `catan-generator/ios/`, og `codemagic.yaml` ligger i **rot** på branchen `cursor/ios-app-store-roadmap-e438` (ikke nødvendigvis på `main` ennå).
   - **Ikke** stol på auto-scan av `main`.
   - Velg project type manuelt: **Ionic / Capacitor** (eller **React Native** / **Other** hvis Ionic mangler).
   - Klikk **Finish: Add application** / fortsett uten scan.
4. Inne i appen i Codemagic:
   - Øverst: velg branch **`cursor/ios-app-store-roadmap-e438`** (eller `main` etter merge).
   - Klikk **Check for configuration file** / scan for `codemagic.yaml`.
   - Du skal se workflows: `ios-build-only` og `ios-testflight`.

### Hvis scan fortsatt feiler

| Felt i Codemagic | Verdi |
|------------------|--------|
| Project type | Ionic / Capacitor (manuelt) |
| Branch to scan | `cursor/ios-app-store-roadmap-e438` |
| Config path | `codemagic.yaml` i repo-roten (ikke under `catan-generator/`) |
| Xcode project (i YAML) | `catan-generator/ios/App/App.xcodeproj` |

Du trenger **ikke** at Codemagic «finner» `.xcodeproj` i rot — YAML-en peker allerede på riktig sti.

---

## Steg 3 — Developer Portal-integrasjon (signering)

1. Codemagic → **Teams** → ditt team → **Integrations** → **Developer Portal** → **Manage keys**
2. **Add key**:
   - **App Store Connect API key name:** `HexSettlementCoach`  
     (må matche `integrations.app_store_connect` i `codemagic.yaml`)
   - Issuer ID + Key ID fra Apple
   - Last opp `.p8`
3. Lagre.

Codemagic henter da sertifikater/profiler automatisk for  
`bundle_identifier: com.hexsettlement.coach` og `distribution_type: app_store`.

---

## Steg 4 — Variabler (anbefalt)

Codemagic → Application → **Environment variables** (eller Team variable group `ios_credentials`):

| Variabel | Verdi | Secure |
|----------|--------|--------|
| `APP_STORE_APPLE_ID` | Numerisk app-ID fra Connect | Nei |
| `CM_NOTIFICATION_EMAIL` (valgfritt) | Din e-post | Nei |

Oppdater også `publishing.email.recipients` i `codemagic.yaml` til din ekte adresse.

---

## Steg 5 — Første bygg

1. I Codemagic UI: velg workflow **`ios-build-only`** først (bygger IPA uten publish).
2. Start build → vent til grønn.
3. Last ned IPA fra Artifacts og verifiser at den finnes.
4. Deretter kjør **`ios-testflight`** — laster opp til TestFlight.

Auto-trigger på push er **av** i YAML til du er klar (unngår mislykkede bygg uten API-nøkkel). Aktiver `triggering` under `ios-testflight` når første manuelle bygg er grønt.

---

## Steg 6 — TestFlight på iPhone

1. App Store Connect → TestFlight → vent til «Processing» er ferdig (5–30 min).
2. Legg til deg selv som Internal Tester.
3. Installer **TestFlight**-appen på iPhone og åpne bygget.

---

## Workflows i YAML

| Workflow | Formål |
|----------|--------|
| `ios-build-only` | Signert IPA, ingen opplasting — bra til første feilsøking |
| `ios-testflight` | Bygg + last opp + `submit_to_testflight: true` |

`submit_to_app_store` er `false` til du bevisst vil sende til App Review.

---

## Vanlige feil

| Symptom | Fix |
|---------|-----|
| Integration key not found | Nøkkelnavn i UI ≠ `HexSettlementCoach` i YAML |
| No profiles / signing failed | Bundle ID ikke registrert, eller API-nøkkel mangler App Manager |
| Scheme App not found | Sjekk at `ios/.../xcshareddata/xcschemes/App.xcscheme` er committet |
| Wrong web base path | Capacitor-build skal bruke `base: '/'` (ikke sett `GITHUB_PAGES=true` i Codemagic) |
| Build number conflict | Sett `APP_STORE_APPLE_ID` så `agvtool` kan hente siste TestFlight-nummer |

---

## Kostnad

Codemagic har gratis minutter for open source / gratis tier (sjekk gjeldende priser). Mac M2-minutter brukes per bygg. Stopp automatisk trigger på feature-brancher hvis du vil spare minutter (rediger `triggering` i YAML).

---

## Neste etter første TestFlight

1. Bytt app-ikon (`resources/` + regenerer assets)
2. Fyll inn App Store-listing ([app-store-listing.en.md](./app-store-listing.en.md))
3. Privacy URL (host `privacy.html`)
4. RevenueCat når du er klar for betaling ([ios-release.md](./ios-release.md))
