Legg de 6 ferdig klippede brikke-bildene her som **PNG med transparent bakgrunn**:

| Ressurs | Filnavn (eksempel) |
|---------|-------------------|
| Tømmer / skog | `skog.png` |
| Tegl / leirgrunn | `leirgrunn.png` |
| Ull / eng | `eng.png` |
| Korn / åker | `åker.png` |
| Malm / fjell | `Fjell.png` |
| Ørken | `ørken.png` |

Kjør deretter fra `catan-generator/`:

```bash
npm run copy:tiles
```

Bildene kopieres til `src/assets/tiles/hex/` og brukes direkte i brettet – ingen ekstra klipping eller fargefjerning.
