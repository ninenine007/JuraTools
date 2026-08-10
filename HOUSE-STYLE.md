# JuraTools — House Style & Build Guide

How the tools in this repo are built, so a new one can be started without
re-deriving the conventions. Written from the 47 tool pages currently in
`JuraTools/`, `labour-core.js`/`.css`, and the
`thai-pit-calculator.design-brief.md` contract.

Read this first, then copy the closest existing tool and edit it. The nearest
neighbours by shape:

| If the new tool is… | Copy |
|---|---|
| A single-purpose calculator | `tax-tools/thai-wht-calculator.html` |
| A large multi-card calculator with a rules panel | `tax-tools/thai-pit-calculator.html` |
| One of a family sharing a domain engine | `labour-tools/labour-severance.html` + `labour-core.js` |
| A document generator (.docx out) | `corporate-tools/share-transfer-instrument.html` |
| Exact-fraction legal division | `intestate-succession.html` |
| A collection hub page | `tax-tools/index.html` |

---

## 1. The non-negotiables

These hold across every tool. Breaking one is a deliberate decision, not a
default.

1. **One self-contained HTML file per tool.** HTML, CSS and JS in the same
   file. No build step, no bundler, no framework, no npm install. Open the file
   from disk and it works.
2. **Runs entirely in the browser.** No server, no API call, no analytics, no
   fonts fetched at runtime. The tools handle client data; nothing leaves the
   machine. This is stated in the UI, not just true in fact — every footer says
   so.
3. **Vanilla JS in one IIFE**, `'use strict'`. No classes unless the domain
   genuinely has objects with identity; plain functions over a single state
   object is the norm.
4. **Works offline after first load.** The only exception is the four
   `.docx`/`.xlsx` tools, which pull JSZip from a CDN (see §9).
5. **Nothing is ever destroyed silently.** No auto-clear, no silent truncation
   of a list, no "we dropped the rows that didn't parse". Warn instead.

The two documented exceptions in the repo, both deliberate:
`utilities/percentage-calculator.html` uses the Tailwind CDN, and two tools use
Chart.js. Don't extend that list without a reason.

---

## 2. Page skeleton

Every tool page is the same seven parts, in this order:

```
nav.nav                sticky breadcrumb, 52px (48px on labour-core)
[.summary-bar]         optional sticky live totals, sits at top:52px
.hero / header         H1 + Thai subtitle + one-line statutory scope
.wrap / .container     the cards
  .card                one per logical step
  .card > details      collapsed rules / assumptions panel
  .card                Result
.actions-row           Copy summary · Reset everything
footer                 statutory citations + disclaimer
```

### Breadcrumb

`JuraTools / <Collection> / <This tool>` with a `← All` button pushed right by
`margin-left:auto`. The crumb ellipsises or hides below 620px; the wordmark
hides below 430px on the longer titles. Every page is reachable upward in one
click.

### Header

```html
<header>
  <h1>Severance Pay Calculator</h1>
  <div class="th">ค่าชดเชย</div>
  <p>Labour Protection Act B.E. 2541, s.118 (tiers, post-2019 Amendment No.7),
     excluded by s.119.</p>
</header>
```

English title, Thai term underneath, then the statutory scope in one sentence.
The user should know what law the tool implements before scrolling.

### Numbered steps

Multi-input tools number their cards — `.step` / `.step-n` / `.step-note`. The
card title is the question being answered ("The employment", "The reason for
leaving"), not a noun ("Inputs").

### Footer

Two lines, always:

```html
<footer>
  <span class="cites">Labour Protection Act B.E. 2541, ss.9, 70, 118, 118/1, 119</span><br>
  Reference tool only — not legal advice. Runs entirely in your browser.
</footer>
```

The citation line lists every section the engine actually implements. It is
part of the tool's correctness claim — if the engine reads a section, cite it.

---

## 3. Visual language

Two variants exist. Pick one and don't mix.

**A. Glass / pastel** (hubs, tax tools, standalone tools). Inline `<style>`
in the page.

- Background `#f2f2f7` plus four soft `radial-gradient` washes at the corners.
- Cards `rgba(255,255,255,0.82)` + `backdrop-filter: blur(16px)`, border
  `rgba(255,255,255,0.9)`, radius 16–18px.
- Nav `rgba(242,242,247,0.82)` + `blur(24px) saturate(200%)`.
- H1 is a clipped gradient: `linear-gradient(135deg, #1c1c1e 0%, <accent> 60%, <second> 100%)`
  with `-webkit-background-clip:text`.
- Each collection owns an accent: legal `#2979ff`, corporate `#7c3aed`, tax
  `#e11d48`, labour `#0891b2`, text/utilities `#0d9488`, math `#ea580c`.
  The gradient wash, the H1 gradient, the focus ring and the primary button all
  use it.

**B. Flat / paper** (`labour-core.css`, shared by the whole labour suite).
Background `#f8f7f5`, opaque `#fff` cards, 8px radius, one-line shadow, blue
`#2563eb` accent. Cheaper to read, prints better, and is the right choice when
several tools must look like one instrument.

Shared by both:

- System font stack, `"Noto Sans Thai"` appended wherever Thai renders.
- `-webkit-font-smoothing: antialiased`.
- `font-variant-numeric: tabular-nums` on every number input, `td.num`, and
  amount readout. Figures must align down a column.
- Semantic colour is fixed: green = money in / favourable, rose or red = money
  out / payable, amber = warning, blue/info = neutral note, purple = a third
  category.
- `--radius` 8px (flat) or 16px (glass); `--shadow` is one soft layer, never a
  hard drop shadow.

### Components worth reusing verbatim

`.card` · `.card-title` (11–13px, uppercase, letterspaced, muted) · `.field` /
`.field-row` (1fr 1fr grid collapsing to 1fr at 480–560px) · `.mode-toggle` +
`.mode-btn.active` · `.chips` / `.chip.active` for presets · `.callout`
(`-amber` / `-info` / `-green` / `-red`) · `table.data` with `tr.total`
(2px top rule) and `tr.muted` · `.amount-box` + `.amount-label` +
`.amount-value` · `.result-cards` · `.section-toggle` with the rotating `▸` ·
`.btn` / `.btn-primary` / `.btn-small`.

### Responsive & print

- Every multi-column grid collapses to one column at 480–560px.
- Wide tables scroll inside their own `.tbl-wrap`, never the page body.
- Any tool that produces a statement carries an `@media print` block that hides
  `.nav`, `.actions-row`, `.btn`, `.chips`, `.mode-toggle`, drops shadows, and
  sets `break-inside: avoid` on cards.

---

## 4. Numbers — the two rules that apply everywhere

These are settled preferences. Wire them in from the start; don't wait to be
asked.

### 4.1 Live thousands separators while typing

Every money field is `type="text" inputmode="decimal"` — never
`type="number"` — and reformats on each `input` event with caret preservation.
Counts and percentages do **not** get this. Reference implementation in
`ccc-default-interest.html`:

```js
function liveFormat(el) {
  var raw = el.value;
  var caret = el.selectionStart == null ? raw.length : el.selectionStart;
  var anchorsBefore = raw.slice(0, caret).replace(/[^0-9.]/g, '').length;
  var neg = /^\s*-/.test(raw);
  var clean = raw.replace(/[^0-9.]/g, '');
  var firstDot = clean.indexOf('.');
  var intp = firstDot >= 0 ? clean.slice(0, firstDot) : clean;
  var frac = firstDot >= 0 ? clean.slice(firstDot + 1).replace(/\./g, '') : null;
  var out = (neg ? '-' : '') + intp.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
          + (frac !== null ? '.' + frac : '');
  if (out === raw) return;
  el.value = out;
  if (document.activeElement === el && el.setSelectionRange) {
    var pos = 0, seen = 0;
    while (pos < out.length && seen < anchorsBefore) {
      if (/[0-9.]/.test(out[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }
}
function parseAmt(v) { return parseFloat(String(v).replace(/[,\s]/g, '')); }
```

Skip reformatting when the field legitimately holds Thai numerals (๐–๙).
Mark money fields with a class (`.amt`) or `data-money="1"` and drive them from
one delegated listener.

### 4.2 Decimals + rounding mode are user settings

Any calculator that outputs money exposes two selects: **decimal places 0–4**
(default 2) and **rounding — normal (half up) / floor / ceiling**. Each computed
line is rounded with the chosen method, and subtotals sum the *rounded* lines so
the printed statement actually adds up.

```js
function roundAmt(n) {
  var dp = currentDp(), mode = currentRounding();
  var f = Math.pow(10, dp), x = n * f;
  var nearest = Math.round(x);
  if (Math.abs(x - nearest) < 1e-6) x = nearest;   // absorb float noise at exact halves
  else x = mode === 'floor' ? Math.floor(x)
         : mode === 'ceil'  ? Math.ceil(x)
         : Math.round(x);
  return x / f;
}
```

The float-noise guard is not optional — without it `floor` on a value that is
mathematically exact returns one unit low.

### 4.3 When floats aren't good enough

Legal division of a fixed pot (estates, pro-rata allocation) uses **exact BigInt
fractions**, not floats, and shows the fraction alongside the decimal.
`intestate-succession.html` is the reference: `F(n, d)` constructor, `gcdBig`
reduction, `fAdd`/`fMul`/`fDiv`, and largest-remainder distribution so the parts
sum exactly to the whole.

---

## 5. Auto with override

**Every computed value is manually overridable, and every override can be reset
to auto.** This is the single most important behavioural rule in the repo — it
exists because legal reality (cancelled certificates, non-sequential numbering,
negotiated terms, a client's own reading of a section) routinely differs from
the normal-case automatic answer.

The mechanics, as implemented in the PIT rules panel:

- Store overrides as **nullable** fields. `null`/`''` = auto. Never overwrite
  the default with the computed value.
- The auto sequence **continues after** a manual value rather than stopping.
- A row whose value differs from default gets `.changed`, which is what makes
  the `↻ reset-auto` button interactive. The button is **always in the DOM** —
  visibility is purely the parent's `.changed` class. On a non-`.changed` row it
  must be `cursor:default` with no affordance, otherwise every row reads as
  dirty.
- **Validate and warn, never block.** A value that looks wrong gets an amber
  callout, not a disabled button.

Applied at the largest scale in the PIT calculator, which is deliberately
**year-agnostic**: there is no tax-year selector. Every rate, bracket, cap and
threshold is a pre-filled editable input with its own reset-to-auto. When the
law changes, the user edits a field instead of waiting for a new version.

Related: expose formatting knobs (decimal precision, rounding) rather than
hardcoding them — same principle.

---

## 6. Being honest about the law

The tools state their own uncertainty. Three devices:

1. **Interpretation toggles.** Where the law is genuinely contested, ship a
   toggle with both readings and name whose view each is — e.g. the succession
   calculator's `เฉพาะผู้สืบสันดานโดยตรง — แนวความเห็น ศ.ดร.พินัย ณ นคร: ตีความ ม.1607
   ประกอบ ม.1639, 1643`. Pick a defensible default; don't hide the choice.
2. **A `verify` tag** on figures that are the author's reading rather than
   settled fact. Visually distinct from ordinary hints. The design brief keeps a
   table of every flagged figure, its default, and why it's flagged.
3. **Show the working.** Results are a waterfall or a step-by-step table with
   the section cited on each line, not a bare number. A cap-group meter reads
   `used X / cap Y` plus the per-member breakdown — that breakdown is why the
   tool beats reading the bracket table, so never reduce it to a single figure.

Also: state what is **not** modelled. The PIT brief has an explicit "Not
modelled (v2)" list. A known gap named is a feature; a known gap unnamed is a
bug.

---

## 7. State, persistence, and handoff

### localStorage

One key per tool, versioned: `pitCalc_v1`, `whtCalc_v1`, `severance_v1`,
`cccInterest_v2`, `marginalia.v1`. Always wrapped:

```js
var KEY = 'pitCalc_v1';
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function load() {
  var st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  return st;
}
```

A `try/catch` that swallows is correct here — private-mode failures must not
break the page. Bump `_v2` when the shape changes, and **migrate legacy fields
on read** rather than discarding (see `loadProfile()` in `labour-core.js`,
which maps the old `terminationDate` to `dismissalDate` + `workedThatDay`).

### The single state object

`var S = {...}` holds everything, `paint()` rewrites the DOM from it, and every
input listener does `pull…(); paint(); save();`. Dynamic lists are regenerated
wholesale by a `render*()` function into a host element; their inputs are
handled by **delegated** listeners on a stable ancestor, matched by `data-`
attribute, never by index-bearing IDs.

### Cross-tool handoff

Tools in a family pass state through the **URL hash**, one verb per receiver:
`#issue=` (wizard → certificates), `#incorp=` (wizard → register book),
`#xfer=`, `#cert=`, `#reg=`, `#inbox=1`. The receiver parses on load, imports,
and clears the hash.

The rule that makes this safe: **store everything, print what you like.** The
share tools share a 10-field person record; a tool that doesn't print
`occupation` still keeps and forwards it, so a person never loses details by
passing through. Merging is **field-level** — an arriving record fills the blank
fields of a name already in the directory rather than being discarded whole, and
never overwrites a non-blank field.

### The dossier: a handoff you can hold

A hash link and a `localStorage` slot only work between two tabs on one machine.
Where a family of tools all describe **one subject** — the share tools all
describe one company — they also read and write a **dossier**: one
`juratools-corporate-dossier` JSON file per subject, which can be emailed, kept
with the matter, or handed to an AI.

Two rules make it a shared file rather than three separate exports:

- **Canonical names, aliases accepted.** The file is written with every tool's
  spelling of a field side by side (`nameTh` *and* `th`, `paidUp` *and* `par`)
  and read as either, so no tool has to rename its internals to join in.
- **Foreign sections are carried, never dropped.** Each tool owns one section
  (`certs`, `transfers`, `register`); everything else — including sections added
  by a version that does not exist yet — is kept verbatim in `carry` and
  re-emitted untouched. A file round-tripped through every tool must accumulate.
  Watch any `adopt`/`load` that rebuilds state from scratch: it has to name
  `carry` explicitly or a reload silently truncates the file.

Opening one **never writes silently**. The confirm dialog says what is arriving,
what it replaces, what is being carried through, and — **named, not counted** —
where the file disagrees with what is already here. Nothing already typed is
overwritten; the file fills blanks, the way person merging does.

The spec an AI is given is a **`.md` in the repo**, readable on GitHub, and the
same bytes ship inside each tool as a `GUIDE_MD` block so the download works
offline (§4). The copy is machine-made — a script owns the block and can check
it — because three hand-kept copies drift.

### Import / export

JSON in and out, with a tool tag and version:

```js
{ tool: 'share-transfer-instrument', version: 2, savedAt: <iso>, state: {...} }
```

Plus CSV/XLSX where a spreadsheet round-trip is natural.

---

## 8. Domain engines

When three or more tools share a domain, lift the maths into a sibling `.js`
exposing one global (`labour-core.js` → `window.LabourCore`, alias `LC`). The
engine is:

- **Pure.** No DOM, no `localStorage` access inside a calc function. Inputs in,
  object out. `computeSeverance()` returns
  `{ days, tierLabel, timeAmount, pieceAmount, amount }` — never writes to the page.
- **Returning a breakdown, not a number.** Every calc returns its components and
  a `detail` string describing the basis used, so the UI can show the working
  without recomputing.
- **Documented against the statute.** The file header lists every Act and
  section it implements. Constants carry the section that fixes them:
  `var RATE_LPA = 15;  // %/yr — s.9 ¶1`.
- **Explicit about disputed derivations.** The comment above `dismissalFacts()`
  explains *why* the boundary is the last day worked **or paid** (s.118 ¶2), not
  merely worked. That reasoning belongs in the code, next to the line it
  justifies.
- **Offering choices, not one answer.** `LEAVE_BASES`, `INTEREST_BASES` — the
  four defensible ways to pro-rate a leave year are all shipped, selectable, and
  each reports its own `detail`.

Shared UI state (the labour suite's employee profile) lives in the core too,
with `load`/`save`/`clear` and a banner offering to reuse it.

---

## 9. Document generation

For `.docx` output the house method is **template injection, not document
construction**:

1. Take the firm's real Word template, base64 it into the file as
   `TEMPLATE_B64` / `SKELETON_B64`.
2. `JSZip.loadAsync(B64, {base64:true})`, replace tokens in
   `word/document.xml`, write the zip back out as a Blob.
3. Strip mail-merge fields from the template first; inject plain tokens.

For generated-from-scratch documents (the register book), keep a skeleton
`.docx` with the styles/fonts/section properties already correct and build only
`<w:body>` — `DOC_OPEN` is the real namespace-complete `<w:document>` opening
tag, reused as `<w:hdr>` for headers.

This is the one place a CDN dependency is accepted (`jszip@3.10.1`). Also note:
a `.xlsx` is just a zip of XML, written the same way with JSZip directly — no
spreadsheet library needed.

Conventions for generated documents: Legal landscape where the form demands it,
one page per certificate/shareholder, real page numbering, Buddhist Era dates,
`(*)` for placeholders the user must fill by hand, and a live in-page preview of
what the export will look like.

---

## 10. Delivering a tool

**Copy summary** — most tools have a button that puts a plain-text version of
the result on the clipboard, formatted to paste straight into a demand letter,
memo or email. Transient `.copied` state on the button, reverting after ~1.3s.

**Reset everything** — always present, always paired with Copy in
`.actions-row`.

**Blank start** — tools open empty, not with a worked example loaded. Where an
example helps, it is a `Load example` button.

### Registering the tool

1. Drop the file in the right collection folder.
2. Add a card to that collection's `index.html`.
3. Add a card to the root `index.html` if it's standalone, or bump the collection's
   tool count badge if not.
4. Add a **changelog entry** to the root `index.html`, newest first,
   `Mon YYYY` + one sentence naming the statutory scope.
5. Add generous `data-tags` — **Thai and English, including the terms you'd
   actually type**. The root search matches card text + tags, so
   `ทะเบียนผู้ถือหุ้น`, `เติมศูนย์`, `undo`, `gross-up` all belong there.
6. Update `README.md` if it's a new collection.
7. If a tool moves, add the old→new path to the `MOVED` map in `404.html`.

---

## 11. The design round-trip

Functionality first, visual design second, as a separate pass. The working tool
is built here; a design-focused Claude session restyles it against a written
brief; the restyled file comes back for integration. Matching the existing house
CSS is *not* sufficient — the visuals are expected to be intentional and to have
character.

So: when a tool is functionally done, write
`.scratch/<feature-slug>/design-brief.md` (or `<tool>.design-brief.md` beside
the tool). `tax-tools/thai-pit-calculator.design-brief.md` is the model. It has
five sections:

1. **What the tool is** — two paragraphs, including "single self-contained HTML
   file, vanilla JS in one IIFE, no build step, no network".
2. **Page structure** — the DOM tree as an indented sketch.
3. **Locked contract** — and this is the point of the document:
   - every element **ID** read or written by JS, grouped by card;
   - every **`data-` attribute** that is structural, in a table with meanings;
   - every **state class** JS toggles (`.changed`, `.full`, `.warn`, `.best`,
     `.copied`, `.total`/`.sub`/`.hl`/`.muted`/`.ind`, `.green`/`.rose`/`.plain`),
     with what applies it and what it means;
   - **input classes** with behaviour attached (`.amt` receives live formatting);
   - any structural invariant that isn't obvious — one span per Thai grapheme
     cluster, hidden textarea ≥16px to stop iOS zoom, `#rulesPanel` must keep an
     `open` property.
4. **Free to change** — colours, type scale, spacing, radii, shadows, the
   gradient wash, icon choices, breakpoints, card order within a section.
5. **Things worth preserving** — the handful of layout decisions that carry the
   tool's meaning, each with its reason. ("The sticky bar is the whole point of
   the layout: with twenty allowances the tax figure must stay visible while
   scrolling inputs. It sits at `top:52px` because the nav is 52px — move one,
   move the other.")

A brief that locks the contract can be merged back without breaking logic. A
brief that only describes the look cannot.

---

## 12. Code conventions

- `var` in the older tools, `const`/`let` in the newer ones. Match the file
  you're in; don't mix within one file.
- Section banners as comments, and the same banner text in the CSS and the JS
  so the two halves line up:
  `// ── Interest engine ─────────────────────────────────────`
- Thai legal terms in comments and labels where that's the real name of the
  thing — `ค่าชดเชย`, `เงินเพิ่ม`, `ค่าลดหย่อน`, `ตราสารการโอนหุ้น`. English
  identifiers, Thai domain vocabulary.
- Statutory citations inline at the line they govern.
- Dates: ISO `yyyy-mm-dd` in state and `<input type="date">`; `en-GB`
  (`9 August 2026`) for display; Buddhist Era only in generated documents.
- Small named date helpers rather than a date library: `parseDate`, `toISO`,
  `addDays`, `addMonths` (with end-of-month clamping), `daysDiff`, `days360`,
  `lastDayOfMonth`.
- `esc()` any user string before it reaches `innerHTML`.
- Keep the calculation core in one place in the file, above the render code, and
  never let it touch the DOM.

---

## 13. Checklist for a new tool

- [ ] Single file; opens from disk with no server
- [ ] Breadcrumb up to collection and root; `← All` button
- [ ] English H1 + Thai term + statutory scope line
- [ ] Money inputs are `type="text" inputmode="decimal"` with live separators
- [ ] Decimals (0–4) + rounding (normal/floor/ceiling) selects; lines rounded, totals sum rounded lines
- [ ] Every computed value overridable; `↻` reset-to-auto gated on `.changed`
- [ ] Contested points are toggles with both readings named
- [ ] Result shows the working, with sections cited
- [ ] localStorage under a versioned key, in `try/catch`, legacy shapes migrated
- [ ] Copy summary + Reset everything
- [ ] Footer: citation line + "Reference tool only — not legal advice. Runs entirely in your browser."
- [ ] Collapses to one column ≤560px; wide tables scroll in their own wrapper
- [ ] `@media print` block if it produces a statement
- [ ] Registered: collection hub card, root card or count bump, changelog entry, Thai+English `data-tags`
- [ ] Design brief written with the JS contract locked
