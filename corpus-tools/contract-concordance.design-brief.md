# Contract Concordance — Phase 1 brief

## Scope and mode

Operate. A desktop-first corpus workbench inside a new JuraTools **Corpus Tools**
collection. It reads a corpus file built offline by `tools/contract-corpus/` and
does every search, count and statistic in the browser.

One self-contained HTML file, vanilla JS in one IIFE, `'use strict'`, no build
step, no framework, no network request, no CDN. It must work from the hosted
relative path `corpus-tools/contract-concordance.html` and when opened directly
from disk.

## Job

Let a Thai corporate lawyer interrogate their own executed contracts as a
corpus: find every occurrence of a word or phrase centred in its context, sort
those occurrences by what surrounds them, see which formulations recur and which
are one-offs, read every termination clause in the collection side by side, and
learn the house drafting standard from what was actually signed.

The corpus is client material. It is loaded from the user's disk, held in the
browser, and never transmitted.

## The corpus file

Read-only input, defined and frozen in `tools/contract-corpus/DESIGN.md` §4.
Develop against `tools/contract-corpus/fixtures/sample.corpus.json`; never
against real client documents. `tools/contract-corpus/validate_corpus.py` is the
arbiter if this tool and the pipeline disagree about the format.

Two properties of that format drive the whole engine:

- **`clauses[].t` holds the only full text.** The tool concatenates every `t`
  into one buffer with a position→clause map and searches by `indexOf`. There is
  no inverted index: Thai has no orthographic word boundaries, so substring
  scanning is the natural primitive, and at 100–500 contracts a 15 MB buffer
  scans in single-digit milliseconds. Do not build a trie or a postings list.
- **`clauses[].b` holds token boundaries** computed offline by PyThaiNLP.
  Decode the space-separated deltas into one flat `Uint32Array` per clause at
  load. This layer, not the search, is what makes whole-word filtering,
  frequency and collocation possible — the browser must never attempt to
  segment Thai itself.

## Phase 1 modes

Four, as tabs over one result surface.

**Concordance (KWIC)** — the core. Query in substring (default), whole-word
(token-boundary gated via `b`) or regex mode. Each hit renders as three columns:
left context right-aligned, the node highlighted and centred, right context
left-aligned. Context is measured in **characters**, not words (Thai gives no
reliable word count), adjustable 20–80, default 40; truncate in JS rather than
with CSS direction tricks, which reorder Thai punctuation.

Sorting is what separates a concordance from a list of search results. Offer
1L, 2L, node, 1R, 2R and document order, where *n*L/*n*R is the *n*th token to
the left/right taken from `b`. Sort with `new Intl.Collator('th-TH')` — native,
no dependency. Show hit count, distinct-document count, and hits per contract
type.

**Clause library** — every clause of a chosen kind, side by side, sorted by `u`
(corpus-wide count of that exact formulation) descending, so the house standard
surfaces at the top and the one-off variants sit below it. Two clauses can be
pinned for side-by-side comparison. This is the "learn to draft from real
examples" surface.

**Collocations** — what habitually surrounds the query, over a ±N token window
(N adjustable 1–10, default 5) using `b`. Report raw frequency, MI and t-score
in one sortable table, stopword filter on by default from `stop`. Clicking a
collocate runs a concordance for node + collocate.

**Wordlist** — the corpus frequency table from `freq`, filterable by language,
searchable, with a stopword toggle. Selecting a word runs its concordance.

## Filters

One filter pane governs all four modes, so a count in one mode always describes
the same subcorpus as a count in another: contract type, language (`th`/`en`/
`mixed`), zone, clause kind, QC-flagged documents, and a minimum-`u` threshold.

Two exclusions are **on by default**, both visible, reversible filters with the
excluded count always stated. Nothing is silently omitted (`HOUSE-STYLE.md` §1.5).

- `zone:"signature"` — names with no drafting value.
- `r:1`, table rows. Measured on eight real contracts: the most-recurring
  clauses in the entire corpus were shareholder table rows (`name | shares | %`)
  recurring across seven documents. Rows are structurally identical across
  matters, so they swamp any recurrence or frequency ranking, and they are the
  most name-dense content there is. A clause library topped by someone's
  shareholding is useless.

Both exclusions apply to the **clause library, wordlist and collocation** views.
**Concordance search still covers rows** — finding a figure inside a table is a
legitimate thing to want — so the row filter is per-view, not global. Mark row
hits visibly in the KWIC table.

## Auto with override

Clause **kind** is the pipeline's default, not its verdict (`HOUSE-STYLE.md` §5).
A clause's kind is editable in the detail pane, the row gets `.changed`, and the
always-present `↻` reverts to the pipeline's answer.

Overrides are keyed by `docId|n`, falling back to `docId|` plus a short hash of
`t` where `n` is null — **never by array index**, which a corpus rebuild
invalidates. Overrides survive rebuilding the corpus and are exportable.

## Persistence

- **IndexedDB** `juratools-corpus`, one record per loaded corpus keyed by a hash
  of the file: the parsed structures and decoded token arrays, so the multi-
  second parse happens once rather than on every visit. Loading a second corpus
  keeps the first; the user chooses which is active.
- **localStorage** `contractCorpus_v1`, wrapped in `try/catch`: active corpus
  hash, filter state, query history, context width, sort, kind overrides.

Replacing a corpus is confirmed in a dialog that names what is being replaced
and what is being kept, never silently.

## Export

Copy summary and Reset everything in `.actions-row`, per house rule. Export the
current view as CSV, JSON or TXT.

**Pseudonymize on export** is a toggle in the export dialog, off by default and
described plainly. It rewrites party names from `docs[].parties`, 13-digit Thai
ID numbers, tax IDs, phone numbers and email addresses into typed placeholders
(`«COMPANY_1»`, `«ID_1»`), consistently within a document so cross-references
survive. It transforms the exported copy only; the corpus in the browser is
untouched. The dialog states that the un-pseudonymized corpus stays on disk and
that the toggle is not a substitute for reading what you are about to send.

## Explicitly not applicable

The tool has no money fields and computes no money. `HOUSE-STYLE.md` §4.1 (live
thousands separators), §4.2 (decimals and rounding selects) and §4.3 (BigInt
fractions) **do not apply** and must not be added. `font-variant-numeric:
tabular-nums` still applies to every count column.

The footer's first line is not a statutory citation but a provenance line:
`Corpus built locally from your own documents — nothing is uploaded.` The second
line is the standard `Reference tool only — not legal advice. Runs entirely in
your browser.`

## Page structure

```text
nav.nav
  JuraTools / Corpus Tools / Contract Concordance / ← All
header
  h1 "Contract Concordance" + .th "คลังข้อความสัญญา" + one-line scope
#corpusBar                     loaded corpus, doc/clause/token counts, Load · Replace
main.app
  aside#paneFilter[data-pane="filter"]
    #filterType #filterLang #filterZone #filterKind #filterQc #filterDup
    #subcorpusSummary
  section#paneResults[data-pane="results"]
    #modeTabs  (concordance | library | collocation | wordlist)
    #queryBar  #queryInput #queryMode #contextWidth #sortSelect #runBtn
    #resultHead   counts and subcorpus statement
    #resultBody   #kwicTable | #libraryList | #collocTable | #wordTable
    #resultMore   explicit "show more" — never an infinite scroll that hides totals
  aside#paneDetail[data-pane="detail"]
    #detailClause  full clause text, heading, number
    #detailDoc     document metadata, QC flags
    #detailKind    kind select + ↻ reset-auto
    #detailNeighbours  previous/next clause in document order
.actions-row  #copyBtn #exportBtn #resetBtn
footer
nav.mobile-tabs                Filter | Results | Detail
#dialogBackdrop > .dialog
#toast
hidden #corpusInput
```

### Stable IDs and structural attributes

| Contract | Purpose |
| --- | --- |
| `#corpus-core` | Pure engine seam: load, decode, search, count, collocate. No DOM inside it. |
| `#corpusBar`, `#corpusName`, `#corpusStats`, `#loadBtn`, `#replaceBtn`, `#corpusInput` | Corpus lifecycle and the file input |
| `#filterType`, `#filterLang`, `#filterZone`, `#filterKind`, `#filterQc`, `#filterDup`, `#subcorpusSummary` | Subcorpus definition, shared by all four modes |
| `#modeTabs`, `[data-mode]` | Mode selection; paired with `role="tab"`, `aria-selected`, `aria-controls`, roving `tabindex` |
| `#queryInput`, `#queryMode`, `#contextWidth`, `#sortSelect`, `#runBtn`, `#queryHistory` | Query definition and history |
| `#resultHead`, `#resultBody`, `#resultMore`, `#kwicTable`, `#libraryList`, `#collocTable`, `#wordTable` | The four result surfaces and their shared header |
| `#detailClause`, `#detailDoc`, `#detailKind`, `#detailKindReset`, `#detailNeighbours`, `#pinA`, `#pinB`, `#compareView` | Detail pane and clause comparison |
| `#copyBtn`, `#exportBtn`, `#resetBtn`, `#exportFormat`, `#exportPseudonymize` | Export lifecycle and the pseudonymization toggle |
| `#paneFilter`, `#paneResults`, `#paneDetail`, `[data-pane]`, `[data-mobile-pane]` | Desktop panes and narrow-screen tab ownership |
| `#dialogBackdrop`, `#dialogTitle`, `#dialogBody`, `#dialogActions`, `#toast` | Confirmation and live feedback |
| `[data-clause]` | Clause index on every result row; the single hook from a row back to the corpus |
| `[data-sort]`, `[data-collocate]`, `[data-word]`, `[data-filter]` | Delegated result-surface actions |

State classes JS toggles: `.active` (selected tab), `.mobile-active` (visible
narrow pane), `.changed` (kind overridden — gates `#detailKindReset`), `.pinned`
(clause held for comparison), `.flagged` (QC-flagged source), `.stale` (filters
changed since the last run), `.copied` (transient, ~1.3s), `.open` (dialog),
`.show` (toast), plus native `[hidden]`/`[disabled]`.

Every dynamically generated control has an accessible name. **Every user string
and every corpus string is `esc()`d before reaching `innerHTML`** — corpus text
is the user's own documents, but it is untrusted input to this page and will
contain angle brackets and ampersands.

### Free to change

Copy, spacing, visual polish, the collocation statistic set, default context
width, result page size, and non-contract class names.

Requiring an explicit contract update: the stable IDs and `data-*` attributes
above, the localStorage key and shape, the IndexedDB store name, the
`corpus-tools/contract-concordance.html` path, the override key derivation, and
the corpus format itself (which is owned by `tools/contract-corpus/DESIGN.md`).

## Visual direction

The **Corpus Tools** collection is new and takes **sepia `#92400e`** as its
accent — the archive. The eight existing accents are all taken: legal `#2979ff`,
corporate `#7c3aed`, utilities `#0d9488`, math `#ea580c`, script `#16a34a`, tax
`#e11d48`, labour `#0891b2` and finance `#4f46e5`. Sepia is the one that reads
as paper and record rather than as a near-duplicate of finance indigo or math
orange. Use variant **A, glass/pastel** (`HOUSE-STYLE.md` §3): `#f2f2f7` ground
with corner radial washes, `rgba(255,255,255,0.82)` cards with
`backdrop-filter: blur(16px)`, 16–18px radii, and the clipped-gradient H1. Sepia
carries the wordmark, active tabs, focus ring and primary button, and nothing
else — the KWIC node highlight is the one other place it may appear, because
that is the tool's single most important mark.

**The concordance line is the subject.** The KWIC surface is the reason the tool
exists; the filter and detail panes support it and must not become equal card
columns. Keep the node column visually fixed so the eye reads straight down the
centre — that vertical alignment is the entire analytical value of a
concordance, and any styling that breaks it has broken the tool.

Thai renders in the system stack with `"Noto Sans Thai"` appended, referenced as
a local family only — no font is fetched at runtime. Give the KWIC rows generous
line-height: Thai stacks vowels and tone marks above and below the baseline, and
tight rows clip them.

At ≤900px the three panes become `Filter` / `Results` / `Detail` tabs. At ≤560px
paired fields go to one column and the wordmark hides. The KWIC table scrolls
inside its own `.tbl-wrap`, never the page body.

## Phase boundaries

Phase 2: Thai↔English clause alignment and a parallel concordance (the corpus
format reserves `clauses[].a` for it); a full-text document reader; cross-
reference resolution (`ตามข้อ ๗` → clause 7); saved queries and named
subcorpora; n-gram and recurring-formula extraction.

Phase 1 may name these as a roadmap but must not imply they are implemented.
