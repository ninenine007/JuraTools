# Build — power-of-attorney.html (หนังสือมอบอำนาจให้ฟ้องคดี)

Rebuilds the template fragments, the signature geometry and the page from the
firm's two highlighted precedents. Run on a Mac with Microsoft Word, Python 3
(`lxml`, `Pillow`), Node, and poppler (`pdftotext`, `pdftoppm`).

**The source files hold real client and lawyer data. Work on copies outside the
repo** (e.g. `$TMPDIR/pwa/`); only the scripts in this folder are committed, and
`build_pwa.py` stores hashes of the old values, never the values.

```
W=$TMPDIR/pwa && mkdir -p $W
cp "<company-grantor precedent>.docx"    $W/company.docx       # base document
cp "<individual-grantor precedent>.docx" $W/individual.docx    # grantor paragraph, added clause, next-page block, signature rows
python3 build_pwa.py $W                     # → out/frags.json, out/tpl.docx, out/old-values.local.json
python3 measure.py $W                       # Word renders measure-state.json → out/geom.json
python3 make_leaklist.py $W/leak.local.json <every sample .docx>
python3 assemble.py $W ../../power-of-attorney.html $W/leak.local.json
cd ../../../mcp-server && npm run sync-templates && npm test
```

`--learn` prints fresh hashes when the source files change (then pin them);
`--discover` prints every run with its highlight flag.

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
