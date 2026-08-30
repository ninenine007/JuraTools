# Contract Corpus — pipeline design & corpus format

## Scope and mode

Design. An offline, local-only Python pipeline that turns a folder of real
contracts (`.docx` plus Azure Document Intelligence output for scanned PDFs)
into a single corpus file that `corpus-tools/contract-concordance.html` reads
entirely in the browser.

This document freezes **the corpus file format** (§4). The pipeline and the
browser tool are built independently against it. Changing §4 requires bumping
`version` and updating both sides.

## Job

Let a Thai corporate lawyer search their own executed contracts as a linguistic
corpus: find every occurrence of a phrase in context, see which formulations
recur and which are one-offs, compare every indemnity clause side by side, and
learn the house drafting standard from what was actually signed — without any
document leaving the machine.

## 1. Non-negotiables

Inherited from `PRODUCT.md` and `HOUSE-STYLE.md` §1, plus two of our own:

1. **Nothing is uploaded.** The pipeline runs locally; the browser tool makes no
   network request. Azure Document Intelligence is called by the user, outside
   this pipeline, and we consume its saved JSON. The pipeline never calls it.
2. **`raw/` is immutable and never committed.** Corpus data is client material.
   `.gitignore` excludes every data directory; only code, lexicons and fixtures
   are tracked.
3. **Every stage is re-runnable from the stage before it.** A bug found in
   segmentation is fixed by re-running stage 3, not by re-OCRing.
4. **Nothing is dropped silently.** A block the segmenter cannot place goes into
   the corpus tagged `zone:"unplaced"` with a QC flag. It never vanishes.
5. **The text is kept faithful.** Real party names and figures stay in the
   corpus (it is local). Pseudonymization is an *export* transform in the
   browser, not an ingest transform.

## 2. Layout

```
tools/contract-corpus/
  DESIGN.md            this file
  README.md            how to run it
  build.py             CLI entry point: stage runner
  ingest_docx.py       .docx  → blocks
  ingest_azure.py      Azure DI JSON → blocks
  clean.py             Thai normalization, line-join, ZWSP harvest
  segment.py           clause / zone segmentation, language tagging
  annotate.py          tokenization, clause-kind classification, dedup
  build_corpus.py      emit the corpus file
  qc.py                quality report
  lexicon/
    clause-kinds.json  clause-type cue lexicon (user-editable)
    legal-terms.txt    custom PyThaiNLP dictionary entries
    contract-types.json contract-type cue lexicon
  fixtures/
    sample.corpus.json a small hand-checked corpus, valid against §4
data/                  gitignored
  raw/                 original .docx / .pdf, never modified
  azure/               Azure DI JSON, one per PDF, same stem as the PDF
  extracted/  clean/  segmented/     per-stage JSONL
  corpus.jtcorpus.gz   the build output
  manifest.csv         one row per document, with QC scores
```

Run as `python build.py --stage all --in data/raw --out data/corpus.jtcorpus.gz`.
Each stage is separately invocable (`--stage segment`) and reads the previous
stage's directory.

## 3. Stages

### 3.1 Ingest

Both ingesters emit the same **block** shape, in document order:

```json
{"i": 12, "kind": "para|heading|row|header|footer|footnote",
 "text": "...", "page": 3, "conf": 0.994}
```

**`.docx`** — walk `document.element.body` in order so tables stay in place;
`python-docx`'s `.paragraphs` silently drops every table and contracts are full
of them (the supplied execution copies carry 12 tables each). Emit table rows as
`kind:"row"` with cells joined by ` | `. Read headers/footers from each section
separately and mark them `header`/`footer` — they repeat on every page and would
otherwise dominate every frequency count.

**Clause numbers are not in the text.** Use `docx_numbering.NumberingWalker`,
which is written and tested against the supplied contracts. See §3.3 — this is
the single most important correction in this document.

Heading detection cannot rely on `Heading 1`..`Heading 3`: the real files use a
custom `CenterHeading` style. Treat any style whose name contains `heading`
case-insensitively as a heading, and note that `List Paragraph` carries 80% of
all paragraphs, so style name alone is nearly no signal — the `w:numPr` level
is.

**Azure Document Intelligence** — consume saved `prebuilt-layout` JSON. Azure
already labels `paragraphs[].role` as `title`, `sectionHeading`, `pageHeader`,
`pageFooter`, `footnote`; map those to our `kind` directly and do **not**
re-derive them heuristically. Take `spans`/`boundingRegions` for the page
number, and carry the confidence through to `conf`. Tables come from `tables[]`
with `cells[].rowIndex`; emit one `row` block per row in reading order,
interleaved with paragraphs by span offset so document order survives.

Because Azure's accuracy is high and its `role` labels are reliable, the
heuristic header/footer stripping and the OCR triage step that a Tesseract
pipeline would need are both **out of scope**. QC keeps a confidence check only
as a spot-check (§3.5).

### 3.2 Clean

Order matters; each step assumes the previous one ran.

1. `\xa0` → space; strip control characters except `\n`.
2. **Harvest ZWSP** (`​`) before removing it, opportunistically. Where a
   Word document carries zero-width spaces at intended word boundaries they are
   free human-labelled segmentation points: record their offsets, feed them to
   `lexicon/legal-terms.txt` candidate generation, then strip them.
   Measured reality: the three supplied contracts contain **zero** ZWSP. Treat
   this as a bonus when present, never as a pillar of the design, and seed the
   legal dictionary by hand instead.
3. `pythainlp.util.normalize()` — repairs `ํา`→`ำ`, duplicated and misordered
   tone marks, repeated vowels.
4. **Line-join.** Join a line to the next when it ends in a Thai character and
   the next begins with one, inserting nothing. Do not join across a blank line
   or where the next line matches the clause-number pattern (§3.3).
5. Collapse runs of spaces to one. **Never strip spaces entirely** — in Thai the
   space is a phrase and clause boundary and carries real information.
6. Keep Thai numerals `๐–๙` in `text`; normalize them only into metadata fields
   (clause numbers, dates, amounts).

Both the pre-clean and post-clean strings are kept in the stage file. Only the
cleaned one reaches the corpus.

### 3.3 Segment

**Clause numbers — the two ingest paths need different strategies.**

*DOCX.* The number is auto-numbering held in `numbering.xml`; the paragraph text
does not contain it. Reconstruct with `docx_numbering.NumberingWalker`. Measured
on the three supplied execution copies: 12, 166 and 88 auto-numbered paragraphs
respectively, and **0** paragraphs whose literal text matched a clause regex. A
regex-only implementation numbers nothing on real files.

*Azure / PDF.* The number was rendered onto the page, so Azure returns it as
ordinary text and the regex below is correct:

```python
CLAUSE = re.compile(r"^\s*(?:ข้อ\s*)?([๐-๙0-9]+(?:[.ฯ][๐-๙0-9]+)*)\s*[.)]?\s+(?=\S)")
```

Do not unify the two paths. Each is right for its source and wrong for the other.

**Clause assembly (DOCX).** In the real files a `Heading 1` paragraph is both
the clause number and the clause title — 15 of 17 and 19 of 21 heading
paragraphs are auto-numbered. So:

- a numbered paragraph whose style name contains `heading` **opens a clause**;
  its text becomes `h` and its reconstructed label becomes `n`/`nd`/`p`
- numbered `List Paragraph`s at deeper levels become their own clause records,
  nested by `p`
- unnumbered paragraphs attach to the open clause as body text

This is why `h` is worth having: headings genuinely exist and carry the clause's
subject, which makes the §3.4 clause-kind classifier's heading rule (score 3)
the strong signal rather than a hopeful one.

Numbering formats seen in the five supplied files: `1.`, `1.1.`, `1.2.1.`,
`(1)`, `(2)`, `(ก)`, `(ข)`, `ก.`–`ง.` — parenthesised and Thai-letter `lvlText`
patterns included. All are produced by the walker; none appear in the text.

Real documents also number **recitals with Thai letters** (`ก.` `ข.` `ค.` `ง.`,
numFmt `thaiLetters`) and **restart numbering mid-document** — parties `1.`–`3.`,
recitals `ก.`–`ง.`, then operative clauses back to `1.` under a different numId.
Both are handled by the walker and both must survive into §4.3.

**Zones**, by cue phrase, in document order — a zone runs until the next zone
opens:

| zone | cues |
|---|---|
| `preamble` | `โดยที่`, `ทำขึ้น ณ`, `ทำที่`, `สัญญาฉบับนี้ทำขึ้น` |
| `parties` | `ระหว่าง`, `ซึ่งต่อไปนี้เรียกว่า`, `ฝ่ายหนึ่ง` |
| `definitions` | `ในสัญญานี้`, `หมายความว่า`, `คำนิยาม` |
| `body` | default once numbered clauses begin |
| `signature` | `ลงชื่อ`, `ลงลายมือชื่อ`, `พยาน` |
| `annex` | `เอกสารแนบท้าย`, `ภาคผนวก`, `สิ่งที่ส่งมาด้วย` |
| `unplaced` | anything the rules cannot assign — kept, flagged, never dropped |

`signature` clauses are indexed but **excluded from frequency, collocation and
clause-library views by default** — they are pure names with no drafting value.
The exclusion is a visible filter in the UI, not a deletion.

**Language.** Per clause, from Thai character ratio (`pythainlp.util.countthai`):
`≥60` → `th`, `≤10` → `en`, otherwise `mixed`. Bilingual documents are indexed
as two independent clause streams; **no Thai↔English alignment is attempted**
(deferred to Phase 2).

### 3.4 Annotate

**Tokenize** with `newmm` over a custom dictionary built from
`pythainlp.corpus.common.thai_words()` plus `lexicon/legal-terms.txt`:

```python
from pythainlp.util import dict_trie
from pythainlp.tokenize import Tokenizer
tok = Tokenizer(custom_dict=dict_trie(base | legal_terms), engine="newmm")
```

The legal dictionary measurably improves segmentation on contract prose and is
seeded from the harvested ZWSP boundaries plus a hand list. English clauses are
tokenized on a simple word regex — PyThaiNLP is not used for them.

Store tokens as **boundary offsets into the clause text**, never as a second
copy of the text (§4.3).

**Clause kind.** Rule-based, scored, from `lexicon/clause-kinds.json`:

```json
{"termination": {"label": "Termination", "labelTh": "การบอกเลิกสัญญา",
  "head": ["บอกเลิกสัญญา","เลิกสัญญา","สิ้นสุดสัญญา","termination"],
  "body": ["บอกกล่าวล่วงหน้า","ผิดนัด","terminate"]}}
```

A `head` hit in the clause heading scores 3; a `body` hit scores 1 each, capped.
Highest score wins; ties and scores below threshold yield `kind: null`. Seed
kinds: termination, force majeure, confidentiality, indemnity, limitation of
liability, governing law, dispute resolution, payment, warranty, assignment,
notices, penalty/liquidated damages, intellectual property, personal data,
entire agreement, severability, amendment.

The lexicon is a plain JSON file the user edits — and the browser tool lets a
clause's kind be overridden by hand and remembers it, per the repo's
auto-with-override rule (`HOUSE-STYLE.md` §5). The pipeline's answer is a
default, never a verdict.

**Dedup.** Contracts are template-heavy; the same boilerplate will appear
hundreds of times. Hash each clause's cleaned text after collapsing digits and
whitespace, and store the corpus-wide count as `dup`. **Duplicates are kept, not
removed** — the count is the signal. A clause appearing 87 times *is* the house
standard, and that is precisely what the user wants to see.

### 3.5 QC

One row per document in `manifest.csv`, plus a printed summary:

- `thaiRatio` — `countthai(text)/100`.
- `oovRate` — share of Thai tokens absent from the dictionary. With Azure OCR
  this should be low and stable; a document that spikes is either a genuinely
  unusual instrument or a page Azure struggled with. Sort descending and read
  the top few.
- `meanConf`, `lowConfBlocks` — from Azure's own confidence, the primary quality
  signal now that OCR is trustworthy.
- `unplacedBlocks` — count of `zone:"unplaced"`, the segmenter's own error rate.
- `clauseCount`, `tokenCount`, `dominant language`.

QC never rejects a document. It reports, and the browser tool surfaces the flags
so a hit from a shaky page is visibly a hit from a shaky page.

## 4. The corpus file — frozen contract

Emitted gzipped as `*.jtcorpus.gz`; the browser sniffs the gzip magic bytes
`1f 8b` and decompresses with the native `DecompressionStream('gzip')`, so an
uncompressed `.jtcorpus.json` also loads. No library either side.

At the target scale — 100–500 contracts, roughly 2–5 M tokens — this is a
10–25 MB gzipped file that parses once and is cached in IndexedDB.

### 4.1 Top level

```json
{
  "format": "juratools-contract-corpus",
  "version": 1,
  "builtAt": "2026-08-30T09:14:02Z",
  "builder": {"pipeline": "0.1.0", "pythainlp": "5.0.4", "tokenizer": "newmm+legal"},
  "stats": {"docs": 312, "clauses": 41288, "tokens": 3910442,
            "byLang": {"th": 35110, "en": 6018, "mixed": 160}},
  "types":  {"service": {"label": "Service agreement", "labelTh": "สัญญาจ้างทำของ"}},
  "kinds":  {"termination": {"label": "Termination", "labelTh": "การบอกเลิกสัญญา"}},
  "zones":  ["preamble","parties","definitions","body","signature","annex","unplaced"],
  "stop":   {"th": ["และ","หรือ","ของ"], "en": ["the","of","and"]},
  "freq":   {"th": [["สัญญา", 20144], ["ผู้ว่าจ้าง", 8801]], "en": [["shall", 5120]]},
  "docs":   [ … ],
  "clauses":[ … ]
}
```

`freq` is the corpus-wide token frequency table, precomputed because it is the
expensive pass; collocations are query-specific and computed in the browser.
`stop` ships `pythainlp.corpus.thai_stopwords()` plus an English list so the
browser needs no corpus of its own.

### 4.2 `docs[]`

```json
{"id": "2567-svc-014",
 "title": "สัญญาจ้างทำของ",
 "type": "service",
 "lang": "th",
 "date": "2024-03-11",
 "parties": [{"role": "ผู้ว่าจ้าง", "name": "บริษัท ก จำกัด"}],
 "src": {"file": "raw/2567-svc-014.pdf", "method": "azure-di:prebuilt-layout", "pages": 14},
 "qc":  {"thaiRatio": 0.94, "oovRate": 0.061, "meanConf": 0.987,
         "lowConfBlocks": 2, "unplacedBlocks": 0},
 "c":   [0, 132]}
```

`c` is the `[start, end)` range into `clauses[]`. Clauses of one document are
always contiguous and in document order, so a hit can be expanded to its
neighbours by index arithmetic alone.

`date` is ISO in state (`HOUSE-STYLE.md` §12); Buddhist Era only in display.

### 4.3 `clauses[]`

Keys are terse because this array dominates the file size.

| key | meaning |
|---|---|
| `d` | index into `docs[]` |
| `n` | normalized clause number, dot-joined — `"5.2"`; Thai-letter levels keep the letter, `"ก"`; `null` when unnumbered |
| `nd` | clause number exactly as Word displays it — `"๕.๒"`, `"1.2.1."`, `"ก."` |
| `p` | **ordinal** at each level, always integers — `[5,2]`, and `ก.` → `[1]`. This is the sort key: Thai letters sort correctly as ordinals and would not as text. |
| `z` | zone (§3.3) |
| `k` | clause kind slug, or `null` |
| `l` | language: `th` \| `en` \| `mixed` |
| `h` | heading text, or `null` |
| `t` | **cleaned clause text** — the only full string stored |
| `b` | token boundaries, encoded per below |
| `g` | source page number |
| `u` | corpus-wide count of this clause's normalized text (`dup`) |
| `q` | `1` when the source block carried a QC flag, else absent |

**`b` encoding.** Space-separated **deltas** between token start offsets, as one
string: `"0 2 5 6 3"` means tokens start at 0, 2, 7, 13, 16. The final token ends
at `t.length`. Deltas are small, so this costs roughly one to two bytes per token
before gzip, versus ~8 for a JSON integer array, and decodes in one linear pass
into a `Uint32Array`.

This layer is the reason PyThaiNLP is in the design at all: Thai word
segmentation is done once, offline, by the strongest available tool, and the
browser receives the answer rather than attempting it in JavaScript.

### 4.4 What the browser does with this

Search does **not** use an inverted index. Thai has no orthographic word
boundaries, so substring scanning is the natural primitive, and at this scale it
is also the fastest thing to build and the hardest to get wrong: the tool
concatenates every `t` into one buffer with a position→clause map and scans with
`indexOf`. A 15 MB buffer scans in single-digit milliseconds.

The token layer `b` is what makes the *linguistic* views possible on top of that
raw scan — whole-word filtering, frequency, collocation windows — without the
browser ever tokenizing Thai itself.

## 5. Not modelled

Named, because a known gap named is a feature (`HOUSE-STYLE.md` §6):

- **Thai↔English clause alignment.** Bilingual contracts are indexed as two
  independent streams. A parallel concordance is the single most valuable
  Phase 2 addition and the design leaves room for it (`clauses[].a`, an
  alignment partner index, is reserved).
- **Semantic / embedding search.** Out of scope; it would require a model at
  runtime and break the no-network rule.
- **Cross-reference resolution.** `ตามข้อ ๗` is not linked to clause 7.
- **Amount, date and party extraction into structured fields** beyond the
  document-level `parties` guess. The corpus is linguistic, not a deal database.
- **Change tracking between versions** of the same contract.
- **Any calling of Azure.** The user runs OCR; the pipeline reads its output.

## 6. Build order and parallelism

Three tracks run independently against §4, which is why §4 is frozen first and
`fixtures/sample.corpus.json` exists:

- **A — Pipeline.** `tools/contract-corpus/`, Python. Delivers a corpus file.
- **B — Browser workbench.** `corpus-tools/contract-concordance.html`, one
  self-contained file. Develops against the fixture, never against real data.
- **C — Collection registration.** `corpus-tools/index.html` hub, root
  `index.html` card and changelog, `README.md`, `.gitignore`.

A and B must both validate against `fixtures/sample.corpus.json`. If they
disagree about the format, the fixture is right and §4 is the arbiter.

## 7. Validated against real documents

§3.1, §3.3 and §4.3 were revised after running the three execution-version Thai
contracts the user supplied through `docx_numbering.py` and a structural probe.
Findings that changed the design: clause numbers live in `numbering.xml` and not
in the text; recitals use Thai-letter numbering; numbering restarts mid-document;
custom heading styles (`CenterHeading`) exist and `List Paragraph` dominates; the
files carry no ZWSP at all; and they are 97–100% Thai despite English filenames.

A second batch (a share pledge agreement and an EBT agreement) added: `Heading 1`
paragraphs are themselves auto-numbered and serve as clause titles; parenthesised
and Thai-letter level formats `(1)`, `(ก)` are in use; nesting reaches three
levels; and a stray tab-indented literal `2.` confirms the text regex still earns
its place as a DOCX fallback, not merely on the Azure path.

Those documents are client material. They were read for structure only, are not
in this repository, and must not be committed.
