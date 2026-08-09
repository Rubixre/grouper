# FPL Coach på PC (enkel start)

Du trenger **Python 3** + **nett**. Ingen `pip install`.

## Første gang (Windows) — anbefalt

1. Installer Python fra https://www.python.org/downloads/  
   Huk av **Add python.exe to PATH**.
2. Last ned og dobbeltklikk:
   [`INSTALL-PC.bat`](https://raw.githubusercontent.com/Rubixre/grouper/main/fpl/INSTALL-PC.bat)  
   (høyreklikk lenken → «Save link as…», eller kopier filen fra repoet)
3. Det lager mappen `%USERPROFILE%\fpl-coach` og åpner den.
4. Dobbeltklikk **`START-FPL.bat`** → menyen åpnes.
5. Velg **1** og lim inn entry-id fra FPL-URL:  
   `fantasy.premierleague.com/entry/`**`1234567`**`/`

Deretter hver uke: dobbeltklikk `START-FPL.bat` → velg **2** (Suggest).

Laget og innstillinger lagres i samme mappe (`config.json`, `my_squad.json`).

## PowerShell (én linje, første gang)

Åpne PowerShell (ikke i `C:\Windows\System32` — f.eks. i Dokumenter) og kjør:

```powershell
$dir = "$env:USERPROFILE\fpl-coach"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; Set-Location $dir; $raw = "https://raw.githubusercontent.com/Rubixre/grouper/main/fpl/tools"; Invoke-WebRequest "$raw/fpl_cli.py" -OutFile fpl_cli.py; Invoke-WebRequest "$raw/START-FPL.bat" -OutFile START-FPL.bat; .\START-FPL.bat
```

## Oppdatere programmet senere

I menyen: velg **10) Oppdater programmet**  
eller i mappen:

```powershell
cd $env:USERPROFILE\fpl-coach
python fpl_cli.py update
```

## Test uten lag (rask sjekk)

```powershell
cd $env:USERPROFILE\fpl-coach
python fpl_cli.py suggest
```

Skal skrive ut en 15-manns tropp, XI, kaptein og chip-råd. Krever nett (FPL API).

## Test siste endringer før de er på main

Hvis du vil prøve en PR-branch (f.eks. nøytral XI+C):

```powershell
$dir = "$env:USERPROFILE\fpl-coach"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; Set-Location $dir; $raw = "https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-neutral-xi-captain-127c/fpl/tools"; Invoke-WebRequest "$raw/fpl_cli.py" -OutFile fpl_cli.py; Invoke-WebRequest "$raw/START-FPL.bat" -OutFile START-FPL.bat; .\START-FPL.bat
```

Etter at PR er merget til `main`: bruk vanlig `INSTALL-PC.bat` / menyvalg **10** for oppdatering.

## Hele repoet (Mac/Linux/git)

```bash
git clone https://github.com/Rubixre/grouper.git
cd grouper/fpl/tools
python3 fpl_cli.py
```

## Finn entry-id

I FPL-appen/nett: Points → se URL `.../entry/1234567/`
