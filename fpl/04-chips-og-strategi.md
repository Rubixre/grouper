# Chips og poeng — 2026/27

Offisielle regler (API + Premier League):

## Chips (2 sett)

| Chip | Effekt | Sett 1 | Sett 2 |
|------|--------|--------|--------|
| Wildcard | Ubegrensede **permanente** bytter | GW2–19 | GW20–38 |
| Free Hit | Ubegrensede bytter **én uke**, deretter tilbake | GW2–19 | GW20–38 |
| Bench Boost | Benken scorer også | GW1–19 | GW20–38 |
| Triple Captain | Kaptein 3× (i stedet for 2×) | GW1–19 | GW20–38 |

- **Maks 1 chip per gameweek**
- Sett 1 **utløper** ved GW19-deadline (lør 2. jan 2027, 14:30 norsk tid) — ingen overføring
- Free Hit **ikke** i GW1; FH i GW19 → kan **ikke** FH i GW20
- Opptil **5 gratis bytter** kan rulles (1 + 4 ekstra)

## Poeng (hovedtrekk)

| Handling | Poeng |
|----------|-------|
| <60 min / ≥60 min | 1 / 2 |
| Mål | GKP 10 · DEF 6 · MID 5 · FWD 4 |
| Assist | 3 |
| Clean sheet | GKP/DEF 4 · MID 1 |
| Saves | 1 per 3 |
| Defensive contribution | +2 (terskel) |
| Bonus | 1–3 |
| Gult / rødt / eget mål / straffe bom | −1 / −3 / −2 / −2 |
| Kaptein / Triple Captain | 2× / 3× |

## Taktikk med høyest forventet poeng

1. **BB på DGW** (eller 15 sikre starters) — høyeste enkelt-EV  
2. **TC på DGW-premium** eller beste H1-enkeltkamp (Haaland/Bruno hjemme vs opprykk)  
3. **WC for å bygge** BB/TC-vinduer (H1: typisk GW6–9)  
4. **FH nesten bare på BGW**

Kjør: `python3 fpl_cli.py chips` og `suggest` (gir ukentlig chip-råd).

## Datagrunnlag (kort)

EV-modellen følger funn fra:

- [Mathematically Safe (2019)](https://mathematicallysafe.wordpress.com/2019/07/01/fpl-analysis-what-five-seasons-of-data-modelling-have-revealed-about-predictive-analysis-fixture-impact-and-optimal-team-structure-in-fantasy-premier-league/) — underlying korrelerer over sesong (ikke uke-for-uke); fixtures hjelper dyre assets mest; penger i DEF+MID; én premium FWD; mid-pris GK
- Nyere: [arxiv 2505.02170](https://arxiv.org/html/2505.02170v3) (recency/hybrid), [OpenFPL](https://arxiv.org/html/2508.09992), [FPL Feed xG overperformance](https://fplfeed.substack.com/p/fpl-analysis-over-performance-in)

`refresh` henter `/element-summary/` + GW-snapshot; `overunder` viser xGI-residualer som fokusliste (ikke auto-bytte).
