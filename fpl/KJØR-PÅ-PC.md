# Kjør FPL-coach på PC (Windows)

Du trenger bare **Python 3** (ingen pip-pakker).  
Kjør **ikke** fra `C:\WINDOWS\system32`.

## Enklest: dobbeltklikk

1. Last ned [INSTALLER-PÅ-PC.bat](https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-stats-model-127c/fpl/INSTALLER-P%C3%85-PC.bat) (høyreklikk lenken → Lagre som…)
2. Dobbeltklikk filen → den lager `C:\Users\<deg>\fpl-coach`
3. Dobbeltklikk **`START-FPL.bat`** i den mappen → menyen åpnes

Etter det: bare `START-FPL.bat` hver gang.

## Alternativ — PowerShell (én gang)

```powershell
mkdir $HOME\fpl-coach -Force
cd $HOME\fpl-coach

Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-stats-model-127c/fpl/tools/fpl_cli.py" -OutFile "fpl_cli.py"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rubixre/grouper/cursor/fpl-stats-model-127c/fpl/tools/START-FPL.bat" -OutFile "START-FPL.bat"

.\START-FPL.bat
```

## Vanlige feil

| Feil | Fix |
|------|-----|
| `Cannot find path '...\system32\fpl\tools'` | Bruk `%USERPROFILE%\fpl-coach`, ikke System32 |
| `python` ikke funnet | Installer Python og huk av **Add to PATH** |
| Svart vindu lukkes med en gang | Kjør `START-FPL.bat` (den pauser til slutt) |

## Finn entry-id

I FPL: Points → URL `.../entry/1234567/` → i menyen: valg **1** (koble lag).
