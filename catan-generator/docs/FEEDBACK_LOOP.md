# Continuous improvement loop

```text
Ship (TestFlight / App Store)
  → Collect (mailto feedback, reviews, Sentry, GitHub Issues)
  → Triage (P0 / P1 / P2 labels)
  → Plan next milestone
  → Build on cursor/*-e438 branch + PR
  → Ship
```

## Channels

| Channel | When |
|---------|------|
| Settings → Send feedback | Always (mailto) |
| App Store reviews | After public release; request review once after first finished setup |
| Sentry | When `VITE_SENTRY_DSN` is set |
| GitHub Issues | Internal triage board |

## Cadence

- **Patch (1.0.x):** about every two weeks — bugs and UX polish  
- **Feature (1.x):** monthly — variants, midgame depth, Premium polish  

## Labels

`bug` · `ux` · `variant` · `premium` · `p0` · `p1` · `p2`
