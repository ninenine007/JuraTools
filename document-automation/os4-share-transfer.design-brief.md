# Design brief — Form อ.ส.4, share transfer instrument (แบบ อ.ส.4 — เฉพาะตราสารการโอนหุ้น)

## 1. What the tool is

`document-automation/os4-share-transfer.html` fills the Revenue Department's own form อ.ส.4
(แบบขอเสียอากรแสตมป์เป็นตัวเงิน) for a share transfer instrument — that instrument only —
and downloads it as a PDF — the RD's file untouched, the values added after it. The lawyer enters the transfer,
the two parties (a one-line Thai address is split into the form's thirteen boxes), who
pays, where and when it is filed, and who signs; the page works out the stamp duty (items
2 and 23, ม.113 surcharge) and shows the filled form live beside the inputs.

Single self-contained HTML file, vanilla JS in one IIFE, no build step, no network. It is
**assembled** by `_build/os4/assemble.py` from `_build/os4/page.src.html` — restyle
**page.src.html**, never the assembled file (it carries ~1.6 MB of inlined assets).

## 2. Page structure

```
nav.nav                                breadcrumb, 52px, sticky
div.app#app[data-view=form|split|preview]
  aside.sidebar                        sticky top:72px
    .side-total#sideTotal              the duty payable, live
    nav.jump#jump  a > span.dot[data-dot]
    .seg#viewSeg  button[data-view]
    .side-actions  button[data-act] …
  main.main
    section.card#c-xfer                the transfer
    section.card#c-tfr > .card-bd[data-party=tfr]   (filled by JS)
    section.card#c-tfe > .card-bd[data-party=tfe]   (filled by JS)
    section.card#c-pay  .pay-opts#payOpts > .pay-opt[data-payer]
    section.card#c-file                office, filing date, surcharge, endorsement
    section.card#c-sig                 signer
    section.card#c-duty                the working, overrides, rules (details.rules)
    section.card#c-opt                 filling style
    section.card#c-out                 file name, downloads, report boxes
  aside.pv#pv                          sticky preview panel
    .pv-body#pvBody                    pages drawn by JS
footer
dialog (.dlg-bg#dlg), #toast, input#filePick, datalist#peopleList
script#os4-data (JSON) · hb.js · hbjs.js · os4-engine.js · the page script
```

## 3. Locked contract

**IDs read or written by JS**

| Where | IDs |
|---|---|
| layout | `app`, `pv`, `pvBody`, `pvPages`, `showVals`, `os4-data` |
| sidebar | `sideTotal`, `jump`, `viewSeg`, `dlSide`, `dlSideP`, `copyBtn` |
| transfer | `insDate`, `insDesc`, `copies`, `shCount`, `shPar`, `shPaid`, `priceSeg`, `shPrice` |
| parties (built by `partyHtml`, `who` = `tfr` / `tfe`) | `{who}-name`, `{who}-tin`, `{who}-tinDot`, `{who}-tinMsg`, `{who}-branch`, `{who}-addr`, `{who}-a-{part}` (13 parts), `{who}-rest` |
| who pays | `payOpts` |
| filing | `office`, `officeList`, `fileSeg`, `fileDate`, `fileMonth`, `fileNote`, `surMode`, `surNote`, `endorse`, `endorseWhy` |
| signature | `signName`, `signNote`, `signPos` |
| duty | `dutyLink`, `dutyTotal`, `dutyTable`, `ovValue`, `ovDutyO`, `ovDutyC`, `ovSurO`, `ovSurC`, `dutyNote` |
| export | `fileName`, `fileList`, `dlMain`, `dlMainP`, `errBox`, `warnBox`, `blankBox`, `noteBox` |
| dialog | `dlg`, `dlgTitle`, `dlgMsg`, `dlgPick`, `dlgNo`, `dlgYes`, `toast`, `filePick`, `peopleList` |

**Structural `data-` attributes**

| Attribute | Meaning |
|---|---|
| `data-p="a.b"` | input bound to the state path (`instrument.date`, `tfr.name`, `shares.price` …) |
| `data-cb="a.b"` | checkbox bound to a state path (`endorse.submitted`, `tfr.noTin`) |
| `data-opt="key"` | filling-style checkbox (`dashes`, `centre`, `officerColumns`, `itemDots`, `totalCount`, `counterpartZero`, `noTinZeros`) |
| `data-addr="who.part"` | an address box; typing overrides the split |
| `data-ov="key"` | an overridable figure (`value`, `dutyOriginal`, `dutyCounterpart`, `surOriginal`, `surCounterpart`) |
| `data-reset="key"` | the auto/manual tag; click resets (`value`, `dutyOriginal`, `dutyCounterpart`, `sur`, `surMode`, `signName`, `fileName`) |
| `data-act` | `download` (the editable PDF — the default), `downloadPrint`, `fromSti`, `open`, `paste`, `saveJson`, `copy`, `example`, `clear`, `clearAddr` (+ `data-who`) |
| `data-view`, `data-pm`, `data-fm`, `data-pos`, `data-pick`, `data-payer`, `data-dot`, `data-party` | view switch, price mode, filing-date mode, position chip, dialog pick, payer card, jump dot, party card host |

**State classes JS toggles**

| Class | On | Means |
|---|---|---|
| `.on` | `.seg button`, `.pay-opt`, `.dlg-bg`, `#toast` | selected / open |
| `.manual` | `.auto-tag` | the value was typed over; the tag resets it |
| `.is-auto` | inputs | showing the worked-out value |
| `.ov` | address box | typed over the split |
| `.ok` / `.warn` | `.jump .dot` | section complete / started |
| `.ok` / `.bad` | `.tin-dot` | tax ID passes / fails its check digit |
| `.copied` | `#copyBtn` | summary copied (~1.3 s) |
| `.show-v` | `#pv` | highlight filled boxes in the preview |

**Input classes**: `.amt` gets live thousands separators (House Style §4.1); `.num` tabular figures.

**Invariants**

- The preview is exact: each `.pg` holds the RD's page as an image and an SVG with
  `viewBox="0 0 595.276 841.89"` drawn from the same glyph positions as the PDF. `.pg`
  must keep `aspect-ratio: 595.276/841.89` and the image and SVG must fill it exactly —
  scale the page, never crop or pad it.
- The glyph outlines live once in a zero-size `<svg>` at the top of `#pvBody`
  (`<path id="og{gid}">`); pages `<use>` them.
- Script order: `#os4-data`, hb.js, hbjs.js, os4-engine.js, then the page script.
- `.sidebar` and `.pv` sit at `top:72px` because the nav is 52px — move one, move the other.

## 4. Free to change

Colours, type scale, spacing, radii, shadows, icons, card order within `main`, the
wording of notes, breakpoints, the look of the dialog and the pay-option cards.

## 5. Worth preserving

- **Form and preview side by side** — the lawyer checks each box against the RD's form
  while typing; the preview is the file, not an approximation.
- **The duty in the sidebar** — the one figure that matters stays visible while scrolling.
- **Two downloads, explained** — the editable PDF first (the default: the RD's fields kept, for
  Acrobat) and print-ready (identical in every viewer, Preview on a Mac included); the note
  under them is why there are two.
- **The scope note** at the top of the first card — this is the อ.ส.4 for a share transfer
  instrument only; keep it visible.
- **Auto with override** on every computed figure, with the tag to reset it.
- **The address boxes under the one-line address** — the split is shown, never hidden.
