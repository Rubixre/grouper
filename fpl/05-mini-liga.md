# Mini-liga-taktikk

I overall rank er jevn template OK. I **privat liga** med få deltakere må du kunne skape gap.

## Rank vs venner

Poeng mot feltet i ligaen din betyr mer enn overall green arrows.

| Scenario | Taktikk |
|----------|---------|
| Du leder | Mer template, færre gambler, sikre kapteiner |
| Du er bak | Øk differensial-andelen, vurder aggressive kaptein/chip |
| Tet topp 3 | Prioriter fixtures + unngå unødvendige −4 |

## Differensialer

**Differensial** ≈ spiller med lavt eierskap i din liga (ofte også lavt overall).

| Eierskap (overall) | Rolle |
|--------------------|-------|
| >40 % | Template — nesten alle har dem |
| 15–40 % | Semi-template |
| 5–15 % | Sterk differensial-kandidat |
| <5 % | Høy risiko — kun med sterk fixture/nyheter |

Verktøy:

```bash
python3 fpl_cli.py rank --max-own 15
python3 fpl_cli.py draft --style differential
```

Mål: **2–4** differensialer i troppen til enhver tid — ikke 10.

## Kaptein-differensial

Risikabelt. Bruk når:

- Template-kaptein har dårlig kamp / tvil om minutter
- Din kandidat har topp-fixture og sikre minutter

Ellers: speil fornuftig kaptein og vinn på bytter/benk.

## Etter hver GW i ligaen

1. Se hvem som scoret mest blant rivalene
2. Noter template-trekk alle gjorde
3. Ikke speil panikk-bytter — kjør din prosess
