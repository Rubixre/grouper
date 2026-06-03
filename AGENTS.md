# AGENTS.md

## Project overview

**grouper** (`https://github.com/Rubixre/grouper`) is a minimal content repository. It currently contains:

- `README.md` — project title
- `Din_helse_lesetekst_oppgaver.docx` — Norwegian health-literacy reading text and individual assignments for 6th grade (*Din helse: Kan du stole på alt du leser på nettet?*)

There is no application server, package manager manifest, Docker stack, or automated test suite in this tree.

## Cursor Cloud specific instructions

### Services

| Component | Required? | Notes |
|-----------|-----------|--------|
| Application / API / database | No | Nothing to start |
| `Din_helse_lesetekst_oppgaver.docx` | Content only | Edit with Word/LibreOffice or programmatically via OOXML |

### Lint / test / build

- **Lint:** Not applicable (no source code).
- **Tests:** Not applicable. To sanity-check the document after changes, run:

  ```bash
  unzip -t Din_helse_lesetekst_oppgaver.docx
  ```

- **Build / run:** Not applicable. There is no `npm run dev`, `docker compose up`, or similar.

### Working with the `.docx` file

- Inspect archive contents: `unzip -l Din_helse_lesetekst_oppgaver.docx`
- Extract plain text (rough): `unzip -p Din_helse_lesetekst_oppgaver.docx word/document.xml` then strip XML tags, or use Python `zipfile` + `xml.etree` on `word/document.xml`.
- Optional system tools (not required by the repo): `pandoc` for conversion, LibreOffice for headless export — install only if a task needs them.

### Git

- Default branch: `main`
- Typical agent branches: `cursor/<descriptive-name>-987e`
