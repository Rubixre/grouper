# Catan Brettgenerator

En nettside for tilfeldig generering av Catan-brett (grunnspill) med startposisjon-analyse.

## Funksjoner

### Brettgenerering
- **37 hexer** i 7 midtstilte rader (4-5-6-7-6-5-4)
- **18 blå kanthexer** rundt ytterkanten + **19 landhexer** med ressurser
- **Tilfeldige ressurser** (4 tømmer, 4 ull, 4 korn, 3 tegl, 3 malm, 1 ørken)
- **Tilfeldige tallbrikker** (2–12, unntatt ørken)
- **6 havnebrikker** (kantbrikker à 3 kystsegmenter) som roteres som faste enheter rundt brettet

### Genereringsregler (på som standard)
- 6 og 8 kan ikke være naboer
- 2 og 12 kan ikke være naboer
- Like ressurser kan ikke være naboer
- Like tall kan ikke være naboer

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
