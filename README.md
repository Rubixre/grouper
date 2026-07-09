# Catan Brettgenerator

En nettside for tilfeldig generering av Catan-brett (grunnspill) med startposisjon-analyse.

## Funksjoner

### Brettgenerering
- **19 hexer** i standard grunnspill-layout
- **Tilfeldige ressurser** (4 tømmer, 4 ull, 4 korn, 3 tegl, 3 malm, 1 ørken)
- **Tilfeldige tallbrikker** (2–12, unntatt ørken)
- **6 havnebrikker** (kantbrikker à 3 kystsegmenter) som roteres som faste enheter rundt brettet

### Genereringsregler (kan slås av/på)
- 6 og 8 kan være naboer
- 2 og 12 kan være naboer
- Like ressurser kan være naboer
- Like tall kan være naboer

### Startposisjon-simulator
- Slange-draft: 1 → 2 → 3 → 4 → 4 → 3 → 2 → 1
- Støtte for 2, 3 eller 4 spillere
- Scoring basert på ressursverdi, terning-sannsynlighet, variasjon og havn
- Viser toppkandidater når det er din tur

## Kom i gang

```bash
cd catan-generator
npm install
npm run dev
```

## Arkitektur

```
src/catan/
  types.ts         – Typer og innstillinger
  hex.ts           – Hex-koordinatsystem
  boardLayout.ts   – 19-hex layout og 18 kyst-slots
  harbors.ts       – 6 unike kantbrikker (3 hexer låst sammen)
  generator.ts     – Brettgenerering med constraint-validering
  settlements.ts   – Vertex-graf, scoring, avstandsregel
  simulator.ts     – Slange-draft simulering
```

## Veien videre
- [ ] Utvidelse (5–6 spillere, flere hexer)
- [ ] Forbedret visuelt design av kantbrikker
- [ ] Malmhavn og flere havntyper
- [ ] Justerbare ressursvekter i UI
- [ ] Eksporter brett som bilde
