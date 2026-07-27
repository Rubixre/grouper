# Kjør FPL-coach på PC (Windows)

Du trenger bare **Python 3** (ingen pip-pakker).  
Kjør **ikke** fra `C:\WINDOWS\system32` — lag en egen mappe.

## Alternativ A — last ned én fil (enklest)

I **PowerShell**:

```powershell
# 1) Lag mappe og gå dit
mkdir $HOME\fpl-coach -Force
cd $HOME\fpl-coach

# 2) Last ned siste coach (stats-modell-branchen)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-stats-model-127c/fpl/tools/fpl_cli.py" -OutFile "fpl_cli.py"

# 3) Kjør (bruk `python` hvis `python3` ikke finnes)
python fpl_cli.py refresh --top 40
python fpl_cli.py suggest
python fpl_cli.py overunder
```

Eller bare meny:

```powershell
cd $HOME\fpl-coach
python fpl_cli.py
```

## Alternativ B — hele repoet (Git)

```powershell
cd $HOME
git clone https://github.com/Rubixre/grouper.git
cd grouper
git checkout cursor/fpl-stats-model-127c
cd fpl\tools
python fpl_cli.py suggest
```

## Vanlige feil

| Feil | Årsak | Fix |
|------|--------|-----|
| `Cannot find path '...\system32\fpl\tools'` | Du sto i System32 | `cd $HOME\fpl-coach` først |
| `can't open file '...\fpl_cli.py'` | Filen ligger ikke der du er | Sjekk med `dir` at `fpl_cli.py` finnes |
| `python3` ikke funnet | Windows bruker ofte `python` | Bytt til `python` |

## Finn entry-id

I FPL: Points → URL `.../entry/1234567/` →

```powershell
python fpl_cli.py link 1234567
```
