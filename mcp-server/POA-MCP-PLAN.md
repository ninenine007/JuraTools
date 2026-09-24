# ใบแต่งทนายความ over MCP — what is built and what is left

The document half runs the browser tool's **v2** engine (rebuilt 2026-09-25) and
is tested, and the MCP tool `create_attorney_appointment` is registered in
`src/tools.mjs` (2026-09-25).

> The first port (v1: `{{token}}` template, padding by character count, runs
> rebuilt per value) produced distorted Word output — three pages, collapsed
> padding, lost ID digits. It has been deleted, template and test included. Do
> not bring any of it back.

## Where things stand

| Piece | File | State |
|---|---|---|
| Templates, field spec, font widths | `templates/attorney-appointment.json` | **done** — `{spec, widths, tpl:{JDA,PY}}` copied from the page's `<script id="poa-data">` by `npm run sync-templates` (preview-only `layout`/`bg` left behind) |
| Fill engine | `src/poa-engine.cjs` | **done** — the page's inline engine, copied verbatim by the same script (source: `../litigation-tools/_build/attorney-appointment/poa-engine.js`). Never edit it here |
| Glue | `src/poa.mjs` | **done** — mirrors `adoptState`, `valuesFor`, `docs`, `fileName`, `summarise` from `_build/attorney-appointment/page.src.html` |
| Test | `test/poa.mjs` | **done**, in `npm test` — fictional data only; see below |
| MCP tool registration | `src/tools.mjs` | **done** — `create_attorney_appointment`; English keys mapped onto the page state by `toPoaState`; round-trip test `test/mcp-poa.mjs` |
| Delivery of more than one file | `src/tools.mjs` | **done** — one `deliver()` per document (option 1 below) |

`src/poa.mjs` exports:

```js
normalize(input)        // → { state, lawyers } from a v2 .poa.json, bare {state, lawyers}, or a v1 file
documentsOf(input)      // → { state, lawyers, docs: [{ S, c, ci, l, fileName }], unmatched: [{ client, key }] }
valuesFor(S, c, l)      // the page's valuesFor — one client × one lawyer → every field id in the spec
fillDocument(doc)       // → { xml, report, missing, summary, blank }   (engine.fill + summarise)
buildDocx(doc)          // → { buffer, ...fillDocument }                 a real .docx
summarise(report)       // → { over, cond, level: 'ok' | 'cond' | 'over' }
fileNameOf(S, {c, l})   // "<matter> - ใบแต่งทนายความ - <role|name> <key>.docx"
idValid(s)              // Thai ID mod-11 check
FIELD_TH                // Thai label per field id, for reporting overflow/blank fields
loadPoa()               // → { D, xml:{JDA,PY}, engine }  (cached)
```

## How filling works (and why the output is not distorted)

- The templates are the firm's own JDA/PY precedents, converted by **Word**, with
  `⟦L|V|T|P|S|D…:id⟧` markers typed into the **original runs**. Filling swaps
  marker text only; every value inherits its run's `<w:rPr>` untouched.
- Padding is computed from TH SarabunPSK widths so each value sits where the
  firm's own file put the old one. A value too long for its blank gets the
  least padding, then `w:spacing` on that one run (up to `opts.maxCondense`,
  default 15 = 0.75 pt), then is **reported** as over — never silently wrapped.
- See `../litigation-tools/_build/attorney-appointment/README.md` for the build.

What `test/poa.mjs` checks, on both templates:

- `templates/attorney-appointment.json` and `src/poa-engine.cjs` are exactly what
  the page ships (a stale sync fails the test);
- `valuesFor` / `fileName` / `idValid` agree with the page's **own functions**,
  lifted from `attorney-appointment.html` and run in a `vm` context;
- no `⟦` survives in any part of the output .docx; no `missing` markers;
- no `<w:rPr>` in the filled `document.xml` that the template lacks, and the
  run count is unchanged;
- a slightly long value is condensed on one run (the only new rPr is the old one
  plus `w:spacing`); a far-too-long one is reported as `over`;
- a v1 `.poa.json` still opens (`side: "defendant"` → JDA).

`POA_WRITE=<dir> node test/poa.mjs` also writes the eight fictional documents for
a visual check in Word.

## The shape a caller sends

The v2 `.poa.json` of `../litigation-tools/attorney-appointment.guide.md` §3,
unchanged — the guide is the specification:

```jsonc
{ "tool": "attorney-appointment", "version": 2,
  "state": { "tpl": "JDA" | "PY", "cse": {…}, "clients": [{ name, role, appointer, appointerRole, appointerSig, lawyers: ["KT"] }],
             "firm": { "officePhone": null }, "opts": { "thaiDigits": true, "maxCondense": 15 } },
  "lawyers": [{ key, name, idNo, licenseNo, phone, email }] }
```

Fan-out rule (`documentsOf`, same as the page's `docs()`): **one document per
client per lawyer key that resolves**. A client with no resolvable lawyer
produces nothing; unresolved keys come back in `unmatched` and must be reported.

`firm.officePhone: null` falls back to the env var `JURATOOLS_OFFICE_PHONE`
(blank if unset) — the server's equivalent of the page's per-browser setting.

## The tool to register

One tool, `create_attorney_appointment`, following `create_share_transfer_instrument`
in `src/tools.mjs` (zod `inputSchema`/`outputSchema`, `deliver(baseName, buffer)`,
text report + `structuredContent`, `isDraft: true`, the `user` log line):

```js
server.registerTool('create_attorney_appointment', {
  title: 'Create ใบแต่งทนายความ (attorney appointment, court form ๙)',
  description:
    'Fill the firm\'s own (๙) ใบแต่งทนายความ precedent (JDA = การถอนคำให้การ, PY = การถอนฟ้อง) ' +
    'as .docx, one document per client per lawyer. Values are typed into the original runs; ' +
    'the s.62 clause, the office address and the court\'s boxes are never touched. ' +
    'Never invent a value — leave it empty. The result is a draft for a lawyer to check.',
  inputSchema: POA_INPUT,        // to write: zod mirror of guide §3 (state + lawyers)
  outputSchema: {
    documents: z.array(z.object({
      fileName: z.string(), location: z.string(), fileSizeKB: z.number(),
      client: z.string(), clientRole: z.string(), lawyer: z.string(),
      overflow: z.array(z.string()),     // summary.over, as FIELD_TH labels
      condensed: z.array(z.string()),    // summary.cond
      blankFields: z.array(z.string())
    })),
    template: z.enum(['JDA', 'PY']),
    unmatchedLawyerKeys: z.array(z.string()),
    isDraft: z.literal(true)
  }
}, async args => { /* documentsOf → buildDocx → deliver, per document */ });
```

Put the guide's rules into each field's `.describe()`; the ones a model gets wrong:

- `court` — only the words after “ศาล” (a leading ศาล is stripped anyway).
- `blackYear` / `redYear` / `year` — last two digits of the Buddhist year; the
  year inside `licenseNo` is the full four.
- `tpl` — follows the client's side by default, but it is the lawyer's call;
  one template per case.
- `appointerRole` / `appointerSig` — `null` = auto; `""` = deliberately blank.
- `redNo`, `dateIso` — usually unknown when filing; leave empty, never guess.

An `over` field means Word will wrap and the form may run to three pages — the
tool must say so in its text report, as the page's export dialog does.

## The open question: delivering several files

`deliver(baseName, buffer)` returns one location. In order of preference:

1. **Call `deliver` once per document** — right on stdio (N files in the folder);
   over HTTP it is N one-time links.
2. **Zip them** as the page does (`<matter> - ใบแต่งทนายความ.zip`, duplicates
   suffixed ` (2)`), one link.
3. **Let the caller choose** with `delivery: 'files' | 'zip'`.

Option 1 first; add the zip only if the HTTP answer turns out unreadable.

## Rules that must not be broken

- **The browser tool is the source of truth.** If `src/poa.mjs` and the page
  disagree, the page is right — and `test/poa.mjs` should already be failing.
- **Re-run `npm run sync-templates`** whenever `litigation-tools/attorney-appointment.html`
  is rebuilt; commit `templates/attorney-appointment.json` and `src/poa-engine.cjs`
  together with it.
- **No real lawyer or client data** in tests, fixtures or docs — fictional values
  only (`นาย ก. ตัวอย่าง`, `บริษัท ก. จำกัด`, `พ.123`, `1234/2567`).
- **Never invent a value**; the document is a draft and every answer says so.
