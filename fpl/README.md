# FPL 2026/27 — bare kjør dette

Mål: **minst mulig lesing**. Én kommando gir lagforslag, bytter og chip-råd.

## 1) Koble laget (én gang)

```bash
cd fpl/tools
python3 fpl_cli.py link 1234567          # ID fra /entry/1234567/
python3 fpl_cli.py link 1234567 --league 987654
```

## 2) Hver uke

```bash
python3 fpl_cli.py refresh               # etter GW: historikk + snapshot
python3 fpl_cli.py suggest
```

Gir: bytter · XI · kaptein · **chip-anbefaling (EV)** basert på ditt lag.

**EV-modellen (Mathematically Safe + nyere papers):**
- FPL `ep_next` + **recency** (siste 3–5 GW fra `element-summary`)
- Form / PPG / xGI (+ CS-proxy for GK/DEF)
- **FDR skalert etter pris** — dyre assets mer fixture-sensitive enn £4.5–5.5
- Mild **xGI residual tilt** (under/over underlying — ikke auto-bytte på én uke)
- Sterkere verdi-vekt for **DEF/MID** (Part Four-struktur)
- Bytter i **forventede poeng** (hits −4)

```bash
python3 fpl_cli.py suggest --apply       # lagre bytter lokalt
python3 fpl_cli.py overunder --top 20    # over/under xGI (fokusliste)
python3 fpl_cli.py chips                 # sesongplan + status
python3 fpl_cli.py chips use 3xc         # merk chip brukt (tc/bb/fh/wc)
python3 fpl_cli.py pull                  # synk etter deadline
```

Historikk lagres lokalt under `fpl/tools/data/history/` og `data/snapshots/`.

## Chip-regler (kort)

- **2 sett** WC/FH/BB/TC (GW1–19 og GW20–38)
- **Maks 1 chip per uke**
- Sett 1 utløper GW19-deadline — brukes ikke → bort
- Beste EV: BB på DGW → TC på DGW/premium → WC for å bygge → FH på BGW

Se [04-chips-og-strategi.md](04-chips-og-strategi.md) for poengtabell og kilder.
