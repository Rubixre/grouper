# Kjøre FPL-coach på telefon (Python Code Pad)

Programmet er **én fil**: [`fpl_cli.py`](tools/fpl_cli.py). Ingen `pip install`. Trenger **nett**.

## Steg

1. Åpne fila på GitHub:  
   `https://github.com/Rubixre/grouper/blob/main/fpl/tools/fpl_cli.py`  
   (eller din PR-branch hvis den ikke er merget ennå)
2. Trykk **Raw** → marker alt → **Kopier**
3. I Python Code Pad: ny fil → **Lim inn** alt → **Kjør / Run**
4. Du får en meny:

```
1) Koble FPL-lag
2) Suggest
…
```

5. Første gang: velg **1** og lim inn entry-id fra  
   `fantasy.premierleague.com/entry/`**`1234567`**`/`
6. Deretter hver uke: velg **2** (Suggest)

## Viktig

- Skru på **internett / nettverkstillatelse** for appen
- Appen må støtte `urllib` (standard i Python) — de fleste Code Pad / Pydroid / Pyto gjør det
- Hvis appen spør om å lagre filer: si ja (da huskes laget mellom kjøringer)

## Fungerer det ikke?

Prøv i stedet **Pydroid 3** (Android) eller **Pyto** (iPhone): lim inn samme fil og kjør.  
På PC er det fortsatt: `cd fpl/tools && python3 fpl_cli.py suggest`
