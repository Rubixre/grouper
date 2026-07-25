# FPL dataverktøy

Python CLI mot den offentlige FPL-API-en. Ingen API-nøkkel, ingen pip-pakker.

## Kommandoer

```bash
# Toppliste (score = EP + form + xGI + verdi + fixtures)
python3 fpl_cli.py rank --top 20
python3 fpl_cli.py rank --pos MID --top 15
python3 fpl_cli.py rank --max-own 15 --differential

# Fixture runs (lav FDR = lettere kamper)
python3 fpl_cli.py fixtures --next 6

# Verdi: forventet poeng per pund
python3 fpl_cli.py value

# Startlag-utkast (£100m, maks 3 per klubb)
python3 fpl_cli.py draft
python3 fpl_cli.py draft --style template
python3 fpl_cli.py draft --style differential

# Ukesrapport før deadline
python3 fpl_cli.py weekly
```

## Slik bruker du tallene

| Signal | Tolkning |
|--------|----------|
| **EP** | FPL sin egen forventning neste GW |
| **FDR** | 1=lett … 5=tøft (offisiell difficulty) |
| **Own%** | Eierskap — lavt = differensial |
| **Score** | Vår sammensatte ranking — startpunkt, ikke fasit |

Verktøyet erstatter ikke nyhetssjekk (skader, rotasjon). Bruk det sammen med [../uke-sjekkliste.md](../uke-sjekkliste.md).
