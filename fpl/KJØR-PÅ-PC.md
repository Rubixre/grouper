# Kjør FPL-coach på PC

Du trenger bare **Python 3** (ingen pip-pakker).

## Alternativ A — hele repoet (anbefalt)

```bash
git clone https://github.com/Rubixre/grouper.git
cd grouper
git checkout cursor/fpl-xi-first-draft-127c
cd fpl/tools
python3 fpl_cli.py
```

Meny åpnes. Eller direkte:

```bash
python3 fpl_cli.py link DITT_ENTRY_ID
python3 fpl_cli.py suggest
```

## Alternativ B — bare én fil

Last ned:
https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-xi-first-draft-127c/fpl/tools/fpl_cli.py

Lagre som `fpl_cli.py`, åpne terminal i samme mappe:

```bash
python3 fpl_cli.py
```

## Finn entry-id

I FPL: Points → se URL `.../entry/1234567/`
