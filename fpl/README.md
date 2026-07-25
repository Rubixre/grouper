# FPL 2026/27 — bare kjør dette

Mål: **minst mulig lesing**. Én kommando gir lagforslag / ukentlige bytter, koblet til ditt FPL-lag.

## 1) Koble laget ditt (én gang)

1. Åpne FPL → Points (eller laget ditt).
2. Se på URL-en: `fantasy.premierleague.com/entry/`**`1234567`**`/`
3. Kjør:

```bash
cd fpl/tools
python3 fpl_cli.py link 1234567
```

Valgfritt mini-liga-id (fra liga-URL):

```bash
python3 fpl_cli.py link 1234567 --league 987654
```

## 2) Hver gang du skal bestemme lag

```bash
python3 fpl_cli.py suggest
```

Det gir deg:

- **Før GW1:** komplett konkurransetropp + XI + kaptein (lagres lokalt)
- **Underveis:** anbefalte bytter for *ditt* lag, ny XI og kaptein

Når du har gjort bytene i FPL-appen:

```bash
python3 fpl_cli.py suggest --apply
```

## 3) Synk fra FPL etter deadline

Etter at en gameweek-deadline har gått (laget blir offentlig):

```bash
python3 fpl_cli.py pull
```

Da hentes den offisielle troppen din og overskriver den lokale — så forslagene følger sesongen.

## Kommandoer

| Kommando | Hva |
|----------|-----|
| `link <id>` | Koble FPL-entry |
| `suggest` | **Hovedkommando** — forslag |
| `suggest --apply` | Lagre bytter lokalt |
| `pull` | Synk tropp fra FPL |
| `show` | Vis lagret tropp |

Ingen pip-install. Krever Python 3 + nett.

GW1-deadline: **21. august 2026, 18:30** norsk tid.
