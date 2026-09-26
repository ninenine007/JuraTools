# Design brief — Attorney Appointment (v2)

For a visual pass on `document-automation/attorney-appointment.html`. Restyle freely;
keep the contract below so the file can be merged back without breaking logic.

## Edit the source, not the page

The page is **assembled**: `_build/attorney-appointment/page.src.html` plus the
engine, templates and preview images inlined by `assemble.py`. Send back a
restyled `page.src.html` (or the assembled page — then only its `<style>` and
markup outside `<script>` will be taken). Leave the two placeholders
`__POA_DATA__` and `__POA_ENGINE__` exactly as they are.

## What the page is

A form (left) that fills the firm's own Word precedent, and a preview (right)
that must look like the printed form, because the lawyer is checking layout,
not data. Two things the design must keep legible:

1. **Fit badges** beside field labels — `เหลือ n pt` (green), `บีบ n pt`
   (amber: condensed spacing was applied), `เกิน n pt` (red: Word will wrap and
   the form may run to 3 pages). These are the tool's main warning; they cannot
   be subtle.
2. **The preview page.** It is a Word-rendered PNG of the blank form with the
   typed values laid on top in TH SarabunPSK at computed positions. Do not
   restyle anything inside `.pg` except the state classes listed below.

## JS contract — keep

**IDs** (all read or written by script):
`app viewSeg clList docCount addClient dupClient tplTiles tplHint loadExample
matter blackNo blackYear redNo redYear court caseType dateIso dateToday dateClear
day month year swapParties partyA roleA partyB roleB clientTitle cName cRole
cAppointer cApRole cApSig cLawyers cLawyersNote lawList lawImport lawExport
lawAdd docRows exportWarn exportAll saveJson openJson clearAll officePhone
maxCond thaiDigits pvDoc pvFit pvBody pvList dlg dlgTitle dlgMsg dlgNo dlgYes
toast filePick poa-data`

**Data attributes** (delegated listeners match on them):
`data-k` (case field path) · `data-ov` (date part override) · `data-c` /
`data-cov` (client field / client override) · `data-lf="i:key"` (lawyer field) ·
`data-fit` / `data-lfit` (badge hosts) · `data-tag` (auto/manual tag) ·
`data-hot` (field id to highlight in preview) · `data-tpl` · `data-ci` ·
`data-del` · `data-lk` · `data-ldel` · `data-dl` · `data-view` · on overlays
`data-f`, `data-w`.

**State classes** set by script:
`.on` (template tile, view button, lawyer chip) · `.active` (client row) ·
`.manual` on `.auto-tag` (clickable ↺ reset) · `.is-auto` on inputs showing a
computed value · `.bad` (ID fails check digit) · `.fit.ok/.cond/.over/.info` ·
`.pv-fit.ok/.cond/.over` · `.dot.ok/.cond/.over` · `.stat.ok/.cond/.over` ·
on overlays `.ov`, `.ov.mask` (white box: value not underlined in Word),
`.ov.over`, `.ov.cond`, `.ov.hot` · `.dlg-bg.on` · `#toast.on`.

**Structural rules**
- `.app[data-view=form|split|preview]` hides panels by CSS — keep those three rules.
- Preview: `.pg-wrap` (sized in px by script) > `.pg` (595.44pt × 841.68pt,
  `transform-origin:0 0`, scaled by script) > `img` + absolutely positioned
  `.ov` spans in **pt**. `.ov` must keep `white-space:pre`, `font-size:17pt`,
  `transform-origin:0 50%`, no padding, no letter-spacing — script measures
  `offsetWidth` and applies `scaleX()` to match Word's width.
- `@font-face PoaSarabun` → `local('TH SarabunPSK')` etc. The preview font must
  stay TH SarabunPSK first.
- Destructive actions use the in-page `#dlg`, never `window.confirm()`.
- `.auto-tag` must stay in the DOM on every row; only `.manual` makes it interactive.

## Free to change

Colours, the card chrome, spacing, typography outside `.pg`, the template tiles'
look, the sidebar, the export table. Accent for the court forms is burgundy
`#9f1239`.
