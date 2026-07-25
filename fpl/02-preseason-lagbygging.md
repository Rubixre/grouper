# Preseason — bygg startlaget

Frem til GW1 har du **ubegrensede bytter**. Bruk tiden til å teste strukturer, ikke til å låse laget uke 1.

## Steg-for-steg

### 1. Hent data

```bash
cd fpl/tools
python3 fpl_cli.py rank --top 20
python3 fpl_cli.py fixtures --next 6
python3 fpl_cli.py value
```

Noter:

- Topp EP/verdi per posisjon
- Lag med letteste fixture-runs (lav FDR)
- Høy-eierskap («template») vs lav-eierskap (differensial)

### 2. Velg struktur (3–4-3 / 3–5–2 / 4–4–2)

For 26/27: start med det `draft`-kommandoen foreslår, deretter juster manuelt.

Tommelfingerregel:

- **3 DEF** hvis midtbane/forward er sterkere
- **4–5 DEF** hvis flere forsvar har gode runs + offensiv trussel

### 3. Bygg tre utkast

| Utkast | Fokus |
|--------|-------|
| **A Template** | Høy-eierskap, trygg, få hull |
| **B Fixture** | Optimalisert for GW1–6 FDR |
| **C Differensial** | 2–4 spillere under ~15 % eierskap |

Kjør:

```bash
python3 fpl_cli.py draft
python3 fpl_cli.py draft --style differential
```

### 4. Kaptein-plan GW1–4

Skriv ned kaptein for de fire første GW **nå**. Endre bare ved skade/rotasjon-nyheter.

### 5. Bench og 1. sub-rekkefølge

Sorter benken etter «mest sannsynlig å få minutter × fixture». Verktøyet viser foreslått rekkefølge i `draft`.

### 6. Last opp og glem prisjag

Siste 48 t før deadline:

- [ ] Ingen skadenyheter i XI
- [ ] Kaptein + VC satt
- [ ] Benkerekkefølge OK
- [ ] Ikke jage +0.1m-prisendringer på bekostning av XI-kvalitet

## Vanlige nybegynnerfeil

1. For mange dyre spillere som ikke starter
2. Ignorere fixtures (bra lag, dårlige kamper)
3. 0 differensialer i mini-liga → du speiler feltet og kan ikke ta igjen
4. Wildcard i GW2 fordi «laget føles feil»
