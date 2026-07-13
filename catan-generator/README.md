# Catan Brettgenerator

## Kom i gang

```bash
npm install
npm run dev
```

Åpne **http://localhost:5173** i nettleseren.

## Teste og inspisere

### 1. Utviklingsserver (anbefalt)
```bash
npm run dev
```
- URL: http://localhost:5173
- Hot reload – endringer vises med en gang
- Bruk nettleserens DevTools (F12) for å inspisere SVG-brettet

### 2. Produksjonsbygg lokalt
```bash
npm run build
npm run preview
```
- URL: http://localhost:4173
- Tester den ferdig bygde versjonen

### 3. Automatisk logikk-test (uten nettleser)
```bash
npm run test:logic
```
Sjekker brettgenerering, havner, vertices og simulator.

### 4. Manuell sjekkliste i nettleseren
1. Klikk **Generer nytt brett**
2. Verifiser at alle fire regler er avkrysset som standard
3. Slå av en regel og generer på nytt
4. Klikk **Start plassering** – grønne markører viser gode plasseringer
5. Velg en markør og **Plasser landsby**
