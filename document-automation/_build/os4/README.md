# Build — os4-share-transfer.html (แบบ อ.ส.4 — เฉพาะตราสารการโอนหุ้น)

Fills the Revenue Department's **own** fillable PDF for a **share transfer
instrument only** (schedule items 2 and 23 — see *Scope* below). Everything here is public: the RD's blank form, an OFL font and an
MIT library, pinned in `assets/`. The firm's filled forms, which hold real names
and tax IDs, are only ever read from outside the repo (the regression and the
leak check below).

```
python3 build_fieldmap.py        # assets/OS4_150861.pdf → fieldmap.json
python3 build_fontinfo.py        # assets/NotoSansThaiLooped-Regular.ttf → fontinfo.json
python3 build_background.py      # the blank form as the preview's background → background.png
node --test test/engine.test.js  # 13 tests, fictional data
python3 make_leaklist.py <folder of the firm's filled อ.ส.4 PDFs> $TMPDIR/leak.local.json
python3 assemble.py $TMPDIR/leak.local.json      # → ../../os4-share-transfer.html
```

Then, for the firm's private MCP server: `python3 scripts/sync_juratools.py <this
JuraTools checkout>` in juraXjk-legal-doc-mcp (it copies `os4-engine.js`, the two
JSON files and the assets), and its tests.

## Assets (pinned — `assemble.py` checks the hashes)

| File | From | Licence |
|---|---|---|
| `OS4_150861.pdf` | https://www.rd.go.th/fileadmin/tax_pdf/SD/OS4_150861.pdf — the form the firm's own files are filled on (same 110 fields, same rectangles) | the RD's published form |
| `NotoSansThaiLooped-Regular.ttf` | google/fonts `ofl/notosansthailooped`, the variable font instanced at wght 400 / wdth 100 (`fonttools varLib.instancer`) | SIL OFL 1.1 (`OFL.txt`), fsType 0 |
| `hb.js`, `hbjs.js`, `hb.wasm` | npm `harfbuzzjs@0.10.3` — the last release with a classic-script loader that takes `wasmBinary` | MIT (`harfbuzzjs-LICENSE.txt`) |

## What the engine does, and why

- **The RD's file is never altered.** The engine appends an ISO 32000 incremental
  update: new versions of the objects it changes, a cross-reference stream with
  `/Prev` = the RD's, the RD's `/ID[0]` kept. The RD's bytes are a prefix of every
  file (a test checks it). The form's own scripts are only `AFNumber_Format` /
  `AFNumber_Keystroke` (commas, whole baht) and `AFSpecial_KeystrokeEx` (the TIN
  mask) — **it computes nothing**, so the duty is worked out here.
- **Two files; the editable one is the default** (the user, 1 Oct 2026). *Fillable*
  writes each filled widget again with `/V` and its own appearance stream and leaves
  the form a form — every value can still be edited in Acrobat. *Print-ready* draws the values on the page (a ninth content stream
  after the RD's eight, which are wrapped in `q`/`Q`) and writes the page and the
  catalog again without the form's fields, the radio ticks drawn with the RD's own
  "on" appearance streams (472, 621). Apple's PDFKit
  (Preview, Safari, iOS) ignores widget appearances and redraws fields itself from
  `/V` — Thai in a system font, no commas, "00" clipped to "0" in the satang boxes —
  and does exactly the same to the firm's Acrobat-filled forms; print-ready is for that.
- **Values as Acrobat stores them.** A number field's `/V` is the raw digits
  (`1250000`) and its appearance the formatted text (`1,250,000`), as the RD's
  `AFNumber_Format(0, …)` would show it; the TIN is `1 2345 67890 12 1`, the mask's
  output, drawn one digit per comb cell.
- **Thai shaped by HarfBuzz** (the shaper browsers use): tone marks over upper
  vowels, marks shifted left over ป ฝ ฟ, ญ/ฐ without their tails before ุ ู, ำ
  decomposed. Each glyph is placed with its own `Td` — as Acrobat writes Thai.
  The page's preview draws the same glyph outlines at the same positions, so the
  preview is the file; the browser and Node write byte-identical PDFs.
- **Sizes match the firm's forms.** Acrobat drew them in Microsoft Sans Serif at 9 pt
  (`/DA … 9 Tf`) and 9.863 pt (`0 Tf`, auto). Noto's Thai is 6 % taller at the same
  size (น 0.562 em against 0.530 em, the same advance), so both are set 6 % smaller.
  A value that does not fit first uses the 1 pt margin, then shrinks and says so.
- **Centring** as the firm does it — leading spaces in `/V`, counted from the font's
  space width — so a field Acrobat redraws after an edit stays roughly centred.

## Conventions (the firm's forms; the RD guide where they differ among themselves)

Read from the firm's eleven forms (fields compared one by one, outside the repo)
and the RD's guide to อ.ส.4 (`Guide_os4_150861.pdf`) and table of instruments
(`document1_100861.pdf`):

| | Default | Source |
|---|---|---|
| payer | transferor, both rows, one form | the firm; RD guide example 2 |
| officer columns (ค่าอากร / เงินเพิ่ม / รวมเงิน) | filled; rate blank | the firm |
| duplicate's มูลค่า | 0.00 | the firm (RD: blank) |
| item numbers | "2." "23." | RD guide (the firm wrote both) |
| รวม จำนวนตราสาร | filled | RD guide (the firm mostly left it) |
| unused address box | "-" | the firm |
| no Thai tax ID | 0 0000 00000 00 0 | the firm |
| มูลค่าของตราสาร when price < paid-up value | the duty's basis | the user, 30 Sep 2026 |

The regression over the firm's forms found, besides the convention changes: duty
typed as value ÷ 1,000 without rounding up (on two forms), a total that
left out the duplicate's 5 baht, a total value off by 5 satang, "จากัด" for
"จำกัด", and a stray ู before คู่ฉบับ. The engine makes none of these.

## Scope — share transfer instruments only

The page, the MCP tool (`create_os4_share_transfer`) and `plan()` are for a share
transfer instrument: rows for item 2 and its duplicates (item 23), the transferor as
the party liable, "before or at the time it is made" as the deadline. The form itself
serves every instrument paid in cash, so another instrument can be built on this
engine — `create()` (layout, appearance streams, the incremental update, flattening)
is the form's and needs no change. What another instrument needs in `plan()`:

- its row(s): the schedule item, the description, the rate and rounding (lease item 1
  per 1,000 of the rent; hire of work item 4 per 1,000; loan item 5 per 2,000 capped
  at 10,000 baht …) and whether a duplicate is made;
- who is liable and who files (the RD's table of instruments: the lessor, the
  contractor, the lender …), and the deadline — leases and hire of work over
  1,000,000 baht have 15 days from the day after the instrument is made;
- the contract box (`Radio Button1`: 0 จ้างทำของ, 1 สัญญาเช่า, 2 อื่นๆ) and the fields
  this one leaves blank — contract number, start and end dates, the original
  contract for a supplementary one (Text1.36–1.46).

Give it its own page and tool name, as this one says "share transfer" in its own.
