# Contract corpus pipeline

Turns a folder of executed contracts — `.docx`, plus saved Azure Document
Intelligence JSON for scanned PDFs — into one corpus file that
`corpus-tools/contract-concordance.html` reads entirely in the browser.

`DESIGN.md` is the specification, and §4 of it is a frozen data contract shared
with the browser tool. `validate_corpus.py` is the arbiter between the two.

**Nothing leaves the machine.** The pipeline runs locally and makes no network
request of any kind. Azure Document Intelligence is run by you, outside this
pipeline; stage 1 reads the JSON you saved. There is no HTTP client, no
endpoint and no key anywhere in this directory, and `test_pipeline.py` fails the
build if one appears.

## Install

```bash
pip install pythainlp python-docx
```

Tested with **pythainlp 5.3.7** and **python-docx 1.2.0** on Python 3.11.
Nothing is pinned; PyThaiNLP ships its dictionaries inside the wheel, so no
corpus is downloaded at runtime. `build.py --help` and the format code
(`validate_corpus.py`) work without either library installed — the imports are
lazy and the error message tells you what to install. Both libraries are needed
for a real run, including an Azure-only one: clause labels are read through
`docx_numbering.py`, which imports python-docx.

## Layout of the data directory

`data/` is gitignored in full. It is client material and never committed.

```
data/
  raw/                  the original .docx and .pdf files, never modified
  azure/                one Azure DI JSON per PDF, same stem as the PDF
  extracted/ clean/ segmented/ annotated/    per-stage JSONL, one file per document
  zwsp-candidates.txt   dictionary candidates harvested from zero-width spaces
  corpus.jtcorpus.gz    the build output
  manifest.csv          one row per document, with QC scores
```

## Run it

```bash
python3 build.py --stage all --in data/raw --out data/corpus.jtcorpus.gz
```

Each stage is separately invocable and reads the previous stage's directory, so
a bug in segmentation is fixed by re-running one stage, never by re-OCRing:

```bash
python3 build.py --stage segment       # re-segment from data/clean
python3 build.py --stage annotate      # then re-tokenize and re-classify
python3 build.py --stage build
```

| flag | meaning |
|---|---|
| `--stage` | `all` (default), or `ingest`, `clean`, `segment`, `annotate`, `build`, `qc` |
| `--in` | folder of `.docx` files (default `data/raw`) |
| `--out` | corpus file to write; a `.gz` suffix gzips it (default `data/corpus.jtcorpus.gz`) |
| `--azure` | folder of saved Azure DI JSON (default `<work>/azure`) |
| `--work` | per-stage working directory (default: the folder `--out` is in) |
| `--lexicon` | lexicon folder (default: the one beside `build.py`) |

Check the result at any time:

```bash
python3 validate_corpus.py data/corpus.jtcorpus.gz
```

## Getting Azure Document Intelligence JSON in

The pipeline **never calls Azure**. You run the analysis and save the response;
the pipeline reads the file.

1. In the [Document Intelligence Studio](https://documentintelligence.ai.azure.com/studio)
   choose **Layout** (`prebuilt-layout`), analyse the PDF, and use the
   **Result** tab's download button — that JSON is what the pipeline reads.
   Or call the REST API / SDK yourself and save the response body.
2. Save it as `data/azure/<same stem as the PDF>.json`. `data/raw/2567-svc-014.pdf`
   pairs with `data/azure/2567-svc-014.json`, and the corpus then records the
   PDF as the document's source file.
3. Either shape of file works: the full operation response with an
   `analyzeResult` key, or a bare `analyzeResult` object.
4. Re-run `python3 build.py --stage all`.

What the ingester uses: `paragraphs[].role` for the block kind (Azure's own
`title` / `sectionHeading` / `pageHeader` / `pageFooter` / `footnote` labels are
used as given and never re-derived), `boundingRegions[].pageNumber` and
`spans[].offset` for the page and for document order, `tables[].cells[]` for
table rows, and `pages[].words[].confidence` averaged over each block for `conf`.

`.docx` files need no preparation — put them in `data/raw/` and run.

## What each stage does

| stage | in → out | notes |
|---|---|---|
| `ingest` | `raw/`, `azure/` → `extracted/` | document order preserved; tables interleaved in place |
| `clean` | `extracted/` → `clean/` | the six steps of DESIGN §3.2, in order; pre-clean text kept |
| `segment` | `clean/` → `segmented/` | clause numbers, clause assembly, zones, language |
| `annotate` | `segmented/` → `annotated/` | newmm tokens as offsets, clause kind, dedup key |
| `build` | `annotated/` → `corpus.jtcorpus.gz` | the §4 file, gzipped |
| `qc` | `annotated/` → `manifest.csv` | one row per document, plus a printed summary |

**Clause numbers come from two different places, on purpose.** In a `.docx` the
number is Word auto-numbering held in `numbering.xml` and is *absent* from the
paragraph text — measured across the supplied contracts, a text regex found
none of them. `docx_numbering.NumberingWalker` reconstructs it. In a scanned
PDF the number was rendered onto the page, so Azure returns it as ordinary text
and the regex in DESIGN §3.3 is right there. Both then go through
`docx_numbering.parse_label`, so `n` and `p` mean the same thing either way.

**Nothing is dropped.** A block the segmenter cannot place becomes a clause with
`z: "unplaced"` and `q: 1`. Duplicates are kept and counted into `u` — a clause
that appears 87 times *is* the house standard, which is the whole point.

## The lexicons

Three plain files, meant to be edited. Re-run `--stage annotate` after a change;
`--stage ingest` is not needed.

- `lexicon/legal-terms.txt` — custom dictionary entries added to
  `pythainlp.corpus.common.thai_words()` before newmm runs, so `บอกเลิกสัญญา`
  segments as one token rather than three. One term per line, `#` comments.
- `lexicon/clause-kinds.json` — the clause-kind cue lexicon. A `head` cue in the
  clause heading scores 3, in the text 2; each `body` cue scores 1, capped at 3;
  the threshold is 2 and a tie yields `null`. The pipeline's answer is a
  default, and the browser tool lets it be overridden by hand.
- `lexicon/contract-types.json` — contract-type cues, scored over the title (3)
  and the opening text (1, capped at 3).

If your Word files happen to contain zero-width spaces, `clean` harvests the
words between them into `data/zwsp-candidates.txt` for you to review and paste
into `legal-terms.txt`. The pipeline never edits a lexicon itself, and the real
contracts carry no ZWSP at all, so this is a bonus and not a mechanism to rely on.

## Reading `manifest.csv`

Sort by `oovRate` descending and read the top few. A document that spikes is
either a genuinely unusual instrument or a page Azure struggled with.
`meanConf` and `lowConfBlocks` come from Azure's own per-word confidence (a
`.docx` reports 1.0, its text having never been guessed at). `unplacedBlocks` is
the segmenter's own error rate. QC never rejects a document — it reports, and
the browser surfaces the flags so a hit from a shaky page is visibly one.

`marginalBlocks` counts running headers, footers and footnotes. They also live
in `zone: "unplaced"` — no contract zone fits a page header — but they are
counted separately, because a repeating header is not a segmentation failure.

## Test

```bash
python3 test_pipeline.py
```

Synthesises a `.docx` (with real auto-numbering in `numbering.xml`, a custom
`CenterHeading` style, a table, a header and a footer) and a small fake Azure
`prebuilt-layout` JSON, runs all six stages over them, and checks the output
against `validate_corpus.py`. Nothing is written outside a temporary directory.

## Known limits

Named, because a known gap named is a feature (`HOUSE-STYLE.md` §6). Beyond
DESIGN §5's list:

- **Page numbers from `.docx` are approximate.** Word repaginates when it opens
  a file, so only explicit page breaks and Word's last-rendered breaks are
  visible to us. Azure page numbers are exact.
- **Headers and footers sit at the edges of a `.docx` document**, not at the
  page boundaries they repeat on — a `.docx` has no pages until Word lays it
  out. They are marked `header`/`footer` regardless.
- **A clause is a block, plus the unnumbered paragraphs that follow it.** A
  numbered clause running over several paragraphs is one clause; an unnumbered
  paragraph with no clause open is a clause of its own. Contiguity in
  `clauses[]` is what lets the browser widen a hit to its neighbours.
- **Recitals land in `parties`, not `preamble`.** They open with `โดยที่` but
  come after the parties in real documents, and zones only move forward.
- **`freq` excludes** headers, footers, footnotes, signature-zone clauses and
  table rows (`r`), so that the shipped wordlist matches the browser's default
  view. `builder.freqScope` in the corpus file says so too. Everything excluded
  is still in `clauses[]` and still searchable.
- **Blocks that clean away to nothing** — an empty paragraph, a stray tab — are
  not given a clause. They are counted in `manifest.csv` as `emptyBlocks`
  rather than passed over in silence.
- **`u` is computed over the whole corpus**, after collapsing digits, bracketed
  blanks (`[ชื่อคู่สัญญา]`) and whitespace. Two template clauses that differ only
  in what was filled in count as the same clause, which is the point; two
  clauses that differ in a real word do not.
