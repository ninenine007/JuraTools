# CLAUDE.md — orientation for AI collaborators

JuraTools is a collection of local-first legal, numerical and drafting tools for
a Thai corporate lawyer. Every tool is a **single self-contained HTML file** that
runs entirely in the browser: no build step, no framework, no server, no network
call. Tools handle real client data, so that is a hard constraint, not a
preference.

This file orients you. It does not restate the conventions — those live in
`HOUSE-STYLE.md`, and a second copy would drift out of date. Read the map,
then read the real document.

## Read these first

| File | What it settles |
|---|---|
| `PRODUCT.md` | Who the user is, what the product is for, the capability constraints |
| `HOUSE-STYLE.md` | **The build guide.** How a tool is structured, styled, tested and registered. Start here for any code change |
| `README.md` | The collection map — which folder holds what |
| `<tool>.design-brief.md` | Per-tool locked contract: element IDs, `data-` attributes, state classes. Four exist; `tax-tools/thai-pit-calculator.design-brief.md` is the model |
| `tools/contract-corpus/DESIGN.md` | The corpus pipeline and its frozen corpus file format |

`HOUSE-STYLE.md` §1 has the non-negotiables, §10 the checklist for delivering a
tool, §11 the design round-trip. If you change a tool's JS contract, update its
design brief in the same commit.

## How to verify your work

Do not report a change as working until you have run the relevant one. These all
work in a clean checkout.

```bash
# Browser-tool engine tests (node:test; the tools expose a pure engine seam)
node --test tests/*.mjs                     # currently 16 tests

# Corpus pipeline
python3 tools/contract-corpus/test_pipeline.py                       # 34 tests
python3 tools/contract-corpus/validate_corpus.py \
        tools/contract-corpus/fixtures/sample.corpus.json
```

**Drive the actual page, don't just read the code.** Chromium is available and
Playwright is configured (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run
`playwright install`). Launch with
`chromium.launch(executable_path="/opt/pw-browsers/chromium")`, open the tool
over `file://`, exercise it, and check for console errors. Several real defects
in this repo were invisible in the source and obvious on screen.

**The engine seam is why single-file tools are testable.** A tool's pure
calculation core sits in its own `<script id="...-core">` block that touches no
DOM; tests extract that block and run it under `node:vm`. See
`tests/combinatorics-workbench.test.mjs`. Preserve the seam when you edit a tool
that has one, and add one when a tool's logic is worth testing.

## Adding or changing a tool

Follow `HOUSE-STYLE.md` §10 and §13. The parts most often forgotten:

- Register it: collection hub card, root `index.html` card or count bump, a
  changelog entry, and **`data-tags` in Thai and English** — the root search
  matches tag text, so include the words a Thai lawyer would actually type.
- Every computed value is manually overridable, and every override resets to
  auto (§5). This is the repo's most important behavioural rule.
- Nothing is destroyed or omitted silently (§1.5). If a view excludes rows, it
  says so on screen with a count.
- Money fields are `type="text" inputmode="decimal"` with live separators, plus
  decimals and rounding selects (§4). **Tools with no money must not have these**
  — do not add them by reflex.

## The corpus subsystem

`corpus-tools/` (browser) and `tools/contract-corpus/` (offline Python) are newer
than the rest and work differently from every other tool: the Python pipeline
turns `.docx` and Azure Document Intelligence output into a corpus file that the
browser workbench searches. `tools/contract-corpus/DESIGN.md` §4 is a **frozen
data contract** — both sides are built against it, and `validate_corpus.py` is
the arbiter when they disagree.

Two design decisions that look wrong until you know why:

- **Search is substring scanning, not an inverted index.** Thai has no
  orthographic word boundaries, so substring search is the natural primitive.
- **Thai is tokenised once, offline, by PyThaiNLP**, and the browser receives
  boundary offsets. The browser must never attempt to segment Thai itself.

## Traps that have already cost time

- **Thai `.docx` clause numbers are not in the text.** They are Word
  auto-numbering in `numbering.xml`; `paragraph.text` returns the clause body
  with no number at all. Measured across 13 real contracts: 630 numbered
  paragraphs, and a text regex matched almost none. Use
  `tools/contract-corpus/docx_numbering.py`. The inverse holds for scanned PDFs,
  where the number was rendered onto the page and a regex is correct.
- **`python-docx`'s `.paragraphs` silently drops every table.** Contracts keep
  substance in tables. Walk `document.element.body` in order.
- **A generated table of contents looks like real headings.** It repeats every
  clause title and can hijack section detection. Detect it structurally (`TOC*`
  style names, `instrText` with `TOC`/`PAGEREF`).
- **Page headers and footers pollute any ranking.** A bare page number recurs
  across every matter and will top a frequency or recurrence list.
- **Generating Thai `.docx` with `python-docx` breaks silently.** It sets only
  the Latin font slot, so Thai text gets the wrong size and floating tone marks —
  invisible in LibreOffice, broken in real Word. Set the complex-script slot too.

## Never

- **Never commit client material.** Real contracts, corpus files and anything
  under `data/` are gitignored and must stay out. Corpus files carry real party
  names and ID numbers.
- **Never add a network call, CDN, framework or build step** to a tool. The two
  documented exceptions are in `HOUSE-STYLE.md` §1; do not extend that list.
- **Never invent law.** Cite the section a rule implements, on the line that
  implements it. Where the law is genuinely contested, ship a toggle naming both
  readings rather than silently picking one (§6).
- Never state a tool works because the code looks right. Run it.
