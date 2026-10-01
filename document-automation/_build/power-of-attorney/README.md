# Build — power-of-attorney.html (หนังสือมอบอำนาจให้ฟ้องคดี)

The page fills three forms of the firm's power of attorney to sue:

| form | source | build |
|---|---|---|
| `th` — the current Thai form, **the default** (Sept 2026) | the firm's cyan-marked Thai precedent | `build_new.py`, `measure_new.py` |
| `thEn` — the same, Thai then English paragraph by paragraph | the firm's cyan-marked Thai–English precedent | `build_new.py`, `measure_new.py` |
| `legacy` — the 2024 form, kept for when it is asked for | the two yellow-highlighted 2024 precedents | `build_pwa.py`, `measure.py` |

Rebuilds the template fragments, the signature geometry and the page from the
firm's precedents. Run on a Mac with Microsoft Word, Python 3
(`lxml`, `Pillow`), Node, and poppler (`pdftotext`, `pdftoppm`).

**The source files hold real client and lawyer data. Work on copies outside the
repo** (e.g. `$TMPDIR/pwa/`); only the scripts in this folder are committed, and
`build_pwa.py` stores hashes of the old values, never the values.

```
W=$TMPDIR/pwa && mkdir -p $W
cp "<company-grantor precedent>.docx"    $W/company.docx       # base document
cp "<individual-grantor precedent>.docx" $W/individual.docx    # grantor paragraph, added clause, next-page block, signature rows
cp "<current Thai precedent>.docx"       $W/th.docx            # cyan = what changes with the case
cp "<current Thai–English precedent>.docx" $W/thEn.docx
python3 build_pwa.py $W                     # → out/frags.json, out/tpl.docx, out/old-values.local.json   (legacy)
python3 build_new.py $W                     # → out/th/…, out/thEn/…, out/new-old-values.local.json
python3 measure.py $W                       # Word renders measure-state.json → out/geom.json            (legacy)
python3 measure_new.py $W                   # Word renders measure-th/-thEn.json → out/<form>/geom.json
python3 make_leaklist.py $W/leak.local.json <every sample .docx>
python3 assemble.py $W ../../power-of-attorney.html $W/leak.local.json
cd ../../../mcp-server && npm run sync-templates && npm test
```

`--learn` prints fresh hashes when the source files change (then pin them;
`build_new.py --learn` rewrites `new-hashes.json`, where a cut that held a
person's or a client's data is pinned by its length only);
`--discover` prints every run with its highlight flag (2024 form).

Regression: fill the precedents' own values (a local state file, never committed)
with `node fill.js $W refill.json refill.docx`, render with `topdf.applescript`,
and `python3 pixdiff.py ref.pdf refill.pdf out-` against the precedent with only
its highlight removed. Page 2 of the company precedent is pixel-identical; page 1
differs only where a name typed into its first run loses the condensing the
drafter gave that one name, and the signature page by the centred names.

## What the build does, and why

- **The highlight is the user's note.** Yellow marks what is fixed; it is removed
  from every run and nothing else about a run changes.
- **Each variable stretch becomes one marker typed into its own first run** —
  the value inherits that run's `<w:rPr>` byte for byte. The only thing typing
  changes is `<w:cs/>`, set per stretch the way Word sets it: on for Thai, off for
  Latin letters and digits, spaces and punctuation staying with their neighbours.
  Separator spaces that the precedent typed as their own run (one is bold) are
  left in place as fixed text.
- **Paragraphs and rows are copied whole.** The attorneys' table repeats its first
  data row; added clauses copy the individual precedent's own added clause
  (numbering is Word's list, `numId` 3); "signatures on the next page" is that
  precedent's note + page break + two blank lines.
- **Signature table** from the precedents' rows: a lone grantor full width and
  centred (a company's name above its director), then rows of two; an odd one
  out spans the full width. Two blank lines above the attorneys (one after a
  company's block, as in that precedent), one after each row.
- **Names centred on their line.** The drafters set each name's indent by hand.
  `measure.py` has Word render one row of each kind and reads where "ลงชื่อ" ends
  and the label begins; the name paragraph becomes `jc=center` with
  `ind left = 2c − W`. The firm's own centred rows (−956, −255) agree to within
  2 pt, which is how the method was checked.
- **Footer** "หน้า {PAGE} ของ 3" had the total typed by hand; it becomes Word's
  NUMPAGES field in the same run properties.
- **Clean-up:** proofing marks, bookmarks (none referenced), rendered page breaks
  and `w14:paraId`/`textId` are dropped so copied paragraphs stay valid;
  `dc:creator` and `cp:lastModifiedBy` are blanked.
- **Words written by the tool itself** (the composed forum sentence) spell
  "องค์กร"; the precedents' fixed text keeps "พนักงานเจ้าหนาที่" and "ร้องข้อ"
  (clause 4) exactly — changing fixed wording is the user's call.

## The current forms (`build_new.py`), and what differs from the 2024 build

- **Cyan marks what changes** (the 2024 precedents marked the fixed text in yellow).
  The user said the marking "may or may not be exact"; the cuts follow it, plus
  the attorneys' table and the names in the signature table, which change with
  every matter though not all marked.
- **The office as "ทำที่".** Both precedents print the firm's office; when the
  place is that address the precedent's own paragraph is used as it stands (the
  drafter condensed part of it to fit the right-hand block); another place is
  typed into its last run.
- **"ฟ้องร้องดำเนินคดีทั้งทางแพ่งและอาญากับ" + the counterparty are one cut** (the
  Thai–English precedent marked them together); the engine types the precedent's
  words back unless the matter is not a suit (`actionOverride`).
- **Clause numbers** are typed text ("→1.→"), so each number's run carries a marker
  and the engine numbers them, added clauses included. The Thai–English
  precedent's clause 3 had no number; a run like its tab is added for "3.".
- **Signature table:** the company's name across the table; a lone signer across
  the full width, centred — the Thai–English precedent's row for its director,
  which the Thai form borrows (Thai lines only); others in pairs from the
  attorneys' row (fixed labels) and the witnesses' row (label marked, so it also
  serves grantors in pairs); an empty line above every row but the grantors'
  first. The Thai–English precedent's right-hand attorney cell had "Signed" in
  14 pt where every other is 12 pt — both cells now take the left one.
- **Signatures on a new page:** the Thai–English precedent's note + page break;
  the Thai form has none and signs straight on (its precedent splits a row across
  pages; the page offers the next-page option, using the Thai–English form's
  Thai line).
- **Not changed:** no footer (the current precedents have none), fixed wording
  as typed — the Thai form's clause 2 "ร้องข้อ", the Thai–English form's clause 2
  "พนักงานเจ้าหนาที่ … ร้องข้อ".

Regression (2026-10-01): refilling both current precedents with their own values
gives the same lines and pages in Word; what differs is the names under the
signature lines (centred by measure instead of by hand, within ~1 pt), the first
attorney's name (the drafter had condensed that one run), the added "3.", and the
Thai–English attorney cell's 12 pt "Signed".
