# Build — attorney-appointment.html

Rebuilds the two embedded templates, their field geometry and the preview
backgrounds from the firm's own Word files. Run on a Mac with Microsoft Word,
Python 3 (`lxml`, `Pillow`), Node, and `pdftotext`/`pdftoppm` (poppler).

**The source files hold real client and lawyer data. Work on copies outside the
repo** (e.g. `$TMPDIR/poa/`); only the scripts in this folder are committed.
`assemble.py` refuses to write the page if any string in your local leak list
(names, IDs, phones, e-mails, client names from the sources) survives.

```
W=$TMPDIR/poa && mkdir -p $W && cp * $W/ && cd $W
cp "<JDA precedent>.doc" jda.doc && cp "<PY precedent>.doc" py.doc
osascript conv.applescript $W/jda.doc $W/jda_word.docx       # Word converts, nothing else
osascript conv.applescript $W/py.doc  $W/py_word.docx
python3 build_poa.py                  # -> out/tplJDA.docx, out/tplPY.docx, out/spec.json
node gen-assets.js                    # -> bg_*.docx (blank), sent_*.docx (token per field)
for n in bg_JDA bg_PY sent_JDA sent_PY; do osascript topdf.applescript $W/$n.docx $W/$n.pdf; done
pdftoppm -r 144 -png bg_JDA.pdf bg_JDA_144; pdftoppm -r 144 -png bg_PY.pdf bg_PY_144
pdftotext -bbox sent_JDA.pdf sent_JDA_bbox.html; pdftotext -bbox sent_PY.pdf sent_PY_bbox.html
python3 extract_layout.py             # -> out/layout.json
python3 assemble.py <repo>/document-automation/attorney-appointment.html <local>/leak.json
```

Regression: `node test-fill.js JDA orig refill.docx` (set `POA_ORIG_ID` to the
source ID), render with `topdf.applescript`, pixel-diff page 1 against the
source's own render — it must be identical.

## What the build does, and why

- **Word converts the .doc.** LibreOffice re-interprets text boxes, spacing and
  the brace; the first version of this tool was built that way and came out
  distorted (3 pages, collapsed padding, lost ID digits).
- **Markers go into the original runs.** `build_poa.py` maps, per field, which
  runs are padding (`L`), value (`V`), leftovers of a value Word split (`x`,
  removed), trailing padding (`T`), and the signature parens (`P`/`S`). The
  value inherits that run's `<w:rPr>` untouched — underline, `cs`, `w:lang`.
  Each map entry carries `sha256[:12]` of the old value; the build stops if a
  run index no longer lands on it.
- **JDA = JDA page 1 + PY page 2.** JDA's own back page has no room for the
  office's building name, so both templates carry the PY file's คำรับเป็นทนายความ.
  The two files' styles are identical apart from an unused one; VML ids and
  bookmark ids are checked for collisions.
- **One text fix:** the PY file's month label reads "ดือน"; it becomes "เดือน"
  inside the same run.
- **Widths** come from TH SarabunPSK's `hmtx` (`widths.json`, units per 1000
  em). `w:spacing` is applied once per grapheme cluster and not at all to a
  cluster ending in a zero-width mark (กิ, ที่, ก์) — measured in Word for Mac,
  10/10 test strings exact. A tab stop past a table cell's text edge stops at
  the edge (cell width − 2×108 twips).
- **Padding policy** (`poa-engine.js`): `center` keeps the old value's centre,
  `left` keeps its left edge, `rtab` is right-aligned by the form's own tab,
  `none` is placed by the paragraph (tab or centred). Refilling the old values
  reproduces the old padding exactly. A value that does not fit gets the least
  padding, then condensed spacing on that run only, up to the user's cap.
