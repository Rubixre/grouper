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

## Test denne PR-branchen (før merge til main)

```powershell
$dir = "$env:USERPROFILE\fpl-coach"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; Set-Location $dir; $b = "cursor/fpl-easy-pc-setup-127c"; $raw = "https://raw.githubusercontent.com/Rubixre/grouper/$b/fpl/tools"; Invoke-WebRequest "$raw/fpl_cli.py" -OutFile fpl_cli.py; Invoke-WebRequest "$raw/START-FPL.bat" -OutFile START-FPL.bat; .\START-FPL.bat
```

Etter merge: vanlig install fra `main` + menyvalg **10** for oppdatering.

## Hele repoet (Mac/Linux/git)

```bash
git clone https://github.com/Rubixre/grouper.git
cd grouper/fpl/tools
python3 fpl_cli.py
```

## Finn entry-id

I FPL-appen/nett: Points → se URL `.../entry/1234567/`
